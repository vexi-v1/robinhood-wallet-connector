import { discoverRobinhood } from './discovery.js';
import { ProviderEmitter } from './emitter.js';
import { focusedElement, hexChainId, parseAccounts, parseChainId, safeStorage, sameAccounts, storagePrefix } from './state.js';
import { ProviderRpcError } from './types.js';
import type { ConnectionModal, ConnectionResult, EIP1193Provider, ProviderDependencies, ProviderListener, RemoteTransport, RequestArguments, RobinhoodProviderOptions, SessionStorage } from './types.js';

/** Larger delays overflow browser and Node timers, which then fire immediately. */
const MAX_TIMER_MS = 2_147_483_647;

interface Attempt {
  controller: AbortController;
  promise: Promise<ConnectionResult>;
  resolve: (result: ConnectionResult) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  modal?: ConnectionModal;
  chainId?: number;
  returnFocus?: HTMLElement;
}

/** Framework-independent, lazy EIP-1193 provider. Constructing it never requests accounts. */
export class RobinhoodProvider extends ProviderEmitter implements EIP1193Provider {
  private attempt?: Attempt;
  private backend?: EIP1193Provider;
  private remotePromise?: Promise<RemoteTransport>;
  private remote?: RemoteTransport;
  private restorePromise?: Promise<boolean>;
  private subscriptions: Array<[string, ProviderListener]> = [];
  private accounts: string[] = [];
  private chainId: number;
  private destroyed = false;
  private revision = 0;
  /** Advanced by cancel(); a connect() waiting on session recovery must not start a later attempt. */
  private intent = 0;
  private readonly storage: SessionStorage;
  private readonly marker: string;
  private currentStatus: 'idle' | 'connecting' | 'connected' = 'idle';
  private currentTransport?: 'injected' | 'walletConnect';
  private errorModal?: ConnectionModal;

  constructor(readonly options: RobinhoodProviderOptions, private readonly dependencies: ProviderDependencies = {}) {
    super();
    if (!options.chains.length) throw new ProviderRpcError(-32602, 'Configure at least one EVM network.');
    [...options.chains, ...(options.optionalChains ?? [])].forEach(parseChainId);
    if (!options.metadata?.name || !/^https?:\/\//.test(options.metadata.url)) throw new ProviderRpcError(-32602, 'Configure an application name and HTTP(S) URL.');
    const connectTimeout = options.connectTimeoutMs ?? 120_000;
    const discoveryTimeout = options.discoveryTimeoutMs ?? 200;
    // NaN fails every comparison; delays beyond the timer range would expire immediately.
    if (!(connectTimeout > 0 && connectTimeout <= MAX_TIMER_MS && discoveryTimeout >= 0 && discoveryTimeout <= MAX_TIMER_MS)) {
      throw new ProviderRpcError(-32602, 'Connection timeouts must be finite: connect above 0 ms, discovery at least 0 ms, both at most 2147483647 ms.');
    }
    this.chainId = options.chains[0];
    this.storage = dependencies.storage ?? safeStorage();
    this.marker = `${storagePrefix(options)}:connected`;
  }

  get status(): 'idle' | 'connecting' | 'connected' { return this.currentStatus; }
  get transport(): 'injected' | 'walletConnect' | undefined { return this.currentTransport; }
  get connected(): boolean { return this.currentStatus === 'connected'; }
  async getAccounts(): Promise<string[]> { return [...this.accounts]; }
  async getChainId(): Promise<number> { return this.chainId; }

  private configured(chainId: number): boolean { return [...this.options.chains, ...(this.options.optionalChains ?? [])].includes(chainId); }
  private active(attempt: Attempt): boolean { return this.attempt === attempt && !attempt.controller.signal.aborted && !this.destroyed; }
  private discover(signal: AbortSignal): Promise<EIP1193Provider | undefined> {
    return this.dependencies.discover?.(signal) ?? discoverRobinhood(signal, this.options.discoveryTimeoutMs);
  }

  private async getRemote(): Promise<RemoteTransport> {
    if (!this.remotePromise) {
      if (!this.options.projectId?.trim()) throw new ProviderRpcError(4100, 'Configure a WalletConnect project ID to connect Robinhood Wallet.');
      this.remotePromise = (this.dependencies.remote?.() ?? import('./transport.js').then(({WalletConnectTransport}) => WalletConnectTransport.create(this.options, this.storage)))
        .then((remote) => { this.remote = remote; if (this.destroyed) remote.destroy(); return remote; })
        .catch((error) => { this.remotePromise = undefined; throw error; });
    }
    return this.remotePromise;
  }

  connect(options: {chainId?: number} = {}): Promise<ConnectionResult> {
    const settled = this.settled(options);
    if (settled) return settled;
    const returnFocus = focusedElement();
    // As eth_requestAccounts does in other wallets, a previously approved and persisted session is
    // recovered without asking again. A fresh approval is requested only when recovery fails.
    if (!this.restorePromise && !this.storage.getItem(this.marker)) return this.begin(options, returnFocus);
    const intent = this.intent;
    return this.isAuthorized().then(() => {
      const recovered = this.settled(options);
      if (recovered) return recovered;
      if (intent !== this.intent) throw new ProviderRpcError(4001, 'Connection cancelled.');
      return this.begin(options, returnFocus);
    });
  }

  /** Outcomes that need no new attempt: unusable input, a shared pending attempt, or the current connection. */
  private settled(options: {chainId?: number}): Promise<ConnectionResult> | undefined {
    if (this.destroyed) return Promise.reject(new ProviderRpcError(4900, 'This provider has been destroyed.'));
    if (options.chainId !== undefined && !this.configured(options.chainId)) return Promise.reject(new ProviderRpcError(4901, 'This network is not configured.'));
    if (this.attempt) {
      if (this.attempt.chainId !== options.chainId) return Promise.reject(new ProviderRpcError(-32002, 'Another connection request is already pending.'));
      return this.attempt.promise;
    }
    if (!this.connected) return undefined;
    if (options.chainId !== undefined && options.chainId !== this.chainId) {
      return this.request({method: 'wallet_switchEthereumChain', params: [{chainId: hexChainId(options.chainId)}]}).then(() => ({accounts: [...this.accounts], chainId: this.chainId}));
    }
    return Promise.resolve({accounts: [...this.accounts], chainId: this.chainId});
  }

  private begin(options: {chainId?: number}, returnFocus: HTMLElement | undefined): Promise<ConnectionResult> {
    ++this.revision;
    this.errorModal?.close();
    this.errorModal = undefined;
    let resolve!: Attempt['resolve'];
    let reject!: Attempt['reject'];
    const promise = new Promise<ConnectionResult>((res, rej) => { resolve = res; reject = rej; });
    const attempt: Attempt = {
      controller: new AbortController(), promise, resolve, reject, chainId: options.chainId, returnFocus,
      timer: setTimeout(() => this.fail(attempt, new ProviderRpcError(4001, 'Connection timed out. Try again from your app.')), this.options.connectTimeoutMs ?? 120_000),
    };
    this.attempt = attempt;
    this.currentStatus = 'connecting';
    void this.run(attempt).catch((error) => this.fail(attempt, error));
    return promise;
  }

  private async run(attempt: Attempt): Promise<void> {
    const injected = await this.discover(attempt.controller.signal);
    if (!this.active(attempt)) return;
    let backend: EIP1193Provider;
    let result: ConnectionResult;
    let transport: 'injected' | 'walletConnect';
    if (injected) {
      backend = injected;
      transport = 'injected';
      let accounts = parseAccounts(await injected.request({method: 'eth_requestAccounts'}));
      if (!this.active(attempt)) return;
      let chainId = parseChainId(await injected.request({method: 'eth_chainId'}));
      if (!this.active(attempt)) return;
      if (attempt.chainId !== undefined && chainId !== attempt.chainId) {
        await injected.request({method: 'wallet_switchEthereumChain', params: [{chainId: hexChainId(attempt.chainId)}]});
        if (!this.active(attempt)) return;
        chainId = parseChainId(await injected.request({method: 'eth_chainId'}));
        if (!this.active(attempt)) return;
        if (chainId !== attempt.chainId) throw new ProviderRpcError(4901, 'The wallet did not switch to the requested network.');
        accounts = parseAccounts(await injected.request({method: 'eth_accounts'}));
        if (!this.active(attempt)) return;
      }
      result = {accounts, chainId};
    } else {
      transport = 'walletConnect';
      if (this.options.showModal !== false) {
        const modal = await (this.dependencies.modal?.() ?? import('./modal.js').then(({RobinhoodModal}) => new RobinhoodModal()));
        if (!this.active(attempt)) { modal.close(); return; }
        attempt.modal = modal;
        modal.open({onCancel: () => { if (this.active(attempt)) this.cancel(); else modal.close(); }, returnFocus: attempt.returnFocus});
      }
      const remote = await this.getRemote();
      if (!this.active(attempt)) return;
      backend = remote;
      result = await remote.connect({chainId: attempt.chainId, signal: attempt.controller.signal, onUri: (uri) => {
        if (!this.active(attempt)) return;
        this.emit('display_uri', uri);
        if (attempt.modal) void attempt.modal.ready(uri).catch((error) => this.fail(attempt, error));
      }});
    }
    if (!this.active(attempt)) return;
    result = {accounts: parseAccounts(result.accounts), chainId: parseChainId(result.chainId)};
    if (!result.accounts.length) throw new ProviderRpcError(4100, 'Robinhood Wallet did not approve an account.');
    if (attempt.chainId !== undefined && result.chainId !== attempt.chainId) throw new ProviderRpcError(4901, 'The requested network was not approved.');
    clearTimeout(attempt.timer);
    attempt.modal?.close();
    try { this.adopt(backend, transport, result); }
    catch (error) { this.clearConnection(); throw error; }
    this.attempt = undefined;
    attempt.resolve({accounts: [...result.accounts], chainId: result.chainId});
    this.emit('connect', {chainId: hexChainId(result.chainId)});
    if (this.backend === backend && this.connected) this.emit('accountsChanged', [...this.accounts]);
  }

  private fail(attempt: Attempt, error: unknown): void {
    if (!this.active(attempt)) return;
    this.attempt = undefined;
    this.currentStatus = 'idle';
    clearTimeout(attempt.timer);
    attempt.controller.abort();
    if (attempt.modal) {
      // Wallet errors can contain sensitive RPC details; keep UI copy fixed and actionable.
      attempt.modal.fail('Could not connect. Close this window and try again from your app.');
      this.errorModal = attempt.modal;
    }
    attempt.reject(error);
  }

  /**
   * Cancels a pending connection, including recovery of a saved session, and closes its dialog.
   * Requests on an established connection continue: recovery and attempts only run while idle.
   */
  cancel(): void {
    const attempt = this.attempt;
    ++this.intent;
    if (this.restorePromise) ++this.revision;
    if (attempt) {
      this.attempt = undefined;
      this.currentStatus = 'idle';
      clearTimeout(attempt.timer);
      attempt.controller.abort();
      attempt.modal?.close();
      attempt.reject(new ProviderRpcError(4001, 'Connection cancelled.'));
    }
    this.errorModal?.close();
    this.errorModal = undefined;
  }

  private adopt(backend: EIP1193Provider, transport: 'injected' | 'walletConnect', result: ConnectionResult): void {
    this.unbind();
    this.backend = backend;
    this.accounts = [...result.accounts];
    this.chainId = result.chainId;
    this.currentTransport = transport;
    this.currentStatus = 'connected';
    this.storage.setItem(this.marker, transport);
    const listen = (event: string, listener: ProviderListener) => {
      const guarded: ProviderListener = (...args) => { if (this.backend === backend && this.connected) listener(...args); };
      backend.on(event, guarded);
      this.subscriptions.push([event, guarded]);
    };
    listen('accountsChanged', (accounts: unknown) => {
      let next: string[];
      try { next = parseAccounts(accounts); } catch { this.clearConnection(new ProviderRpcError(-32603, 'Wallet returned invalid account data.')); return; }
      // clearConnection reports the empty account list once, followed by disconnect.
      if (!next.length) { this.clearConnection(new ProviderRpcError(4100, 'Wallet account access was removed.')); return; }
      this.accounts = next;
      this.emit('accountsChanged', [...next]);
    });
    listen('chainChanged', (chainId: unknown) => {
      try { this.chainId = parseChainId(chainId); this.emit('chainChanged', hexChainId(this.chainId)); }
      catch { this.clearConnection(new ProviderRpcError(-32603, 'Wallet returned invalid network data.')); }
    });
    listen('disconnect', (error: unknown) => this.clearConnection(error));
    listen('message', (message: unknown) => this.emit('message', message));
  }

  private unbind(): void {
    for (const [event, listener] of this.subscriptions) {
      try { this.backend?.removeListener(event, listener); } catch { /* A broken provider cannot prevent local disconnection. */ }
    }
    this.subscriptions = [];
  }

  private clearConnection(error: unknown = new ProviderRpcError(4900, 'Wallet disconnected.')): void {
    const wasConnected = this.connected;
    this.unbind();
    this.backend = undefined;
    this.accounts = [];
    this.currentStatus = 'idle';
    this.currentTransport = undefined;
    this.storage.removeItem(this.marker);
    ++this.revision;
    // Both events describe the connection that ended, even when an accountsChanged listener reenters.
    if (wasConnected) { this.emit('accountsChanged', []); this.emit('disconnect', error); }
  }

  async isAuthorized(): Promise<boolean> {
    if (this.destroyed) return false;
    if (this.connected) return true;
    if (this.attempt) return false;
    if (this.restorePromise) return this.restorePromise;
    const marker = this.storage.getItem(this.marker);
    if (!marker) return false;
    const revision = this.revision;
    this.restorePromise = (async () => {
      let backend: EIP1193Provider | undefined;
      let result: ConnectionResult | undefined;
      if (marker === 'injected') {
        backend = await this.discover(new AbortController().signal);
        if (this.destroyed || revision !== this.revision || this.attempt) return false;
        if (backend) result = {accounts: parseAccounts(await backend.request({method: 'eth_accounts'})), chainId: parseChainId(await backend.request({method: 'eth_chainId'}))};
      } else if (marker === 'walletConnect') {
        const remote = await this.getRemote();
        if (this.destroyed || revision !== this.revision || this.attempt) return false;
        backend = remote;
        result = await remote.restore();
      }
      if (this.destroyed || revision !== this.revision || this.attempt) return false;
      if (!backend || !result?.accounts.length) { this.storage.removeItem(this.marker); return false; }
      this.adopt(backend, marker as 'injected' | 'walletConnect', result);
      return true;
    })().catch(() => false).finally(() => { this.restorePromise = undefined; });
    return this.restorePromise;
  }

  async request<T = unknown>(args: RequestArguments): Promise<T> {
    if (!args || typeof args.method !== 'string') throw new ProviderRpcError(-32600, 'A request method is required.');
    if (args.method === 'eth_requestAccounts') return (await this.connect()).accounts as T;
    if (args.method === 'eth_accounts') return [...this.accounts] as T;
    if (args.method === 'eth_chainId') return hexChainId(this.chainId) as T;
    if (!this.backend || !this.connected) throw new ProviderRpcError(4900, 'Connect Robinhood Wallet first.');
    const backend = this.backend;
    const revision = this.revision;
    if (args.method === 'wallet_switchEthereumChain') {
      const param = Array.isArray(args.params) ? args.params[0] : undefined;
      const chain = parseChainId((param as {chainId?: unknown})?.chainId);
      if (!this.configured(chain)) throw new ProviderRpcError(4901, 'This network is not configured.');
      const result = await backend.request<T>(args);
      if (this.backend !== backend || revision !== this.revision) throw new ProviderRpcError(4900, 'Wallet disconnected before the request completed.');
      const actual = parseChainId(await backend.request({method: 'eth_chainId'}));
      if (this.backend !== backend || revision !== this.revision) throw new ProviderRpcError(4900, 'Wallet disconnected before the request completed.');
      if (actual !== chain) throw new ProviderRpcError(4901, 'The wallet did not switch to the requested network.');
      const accounts = parseAccounts(await backend.request({method: 'eth_accounts'}));
      if (this.backend !== backend || revision !== this.revision) throw new ProviderRpcError(4900, 'Wallet disconnected before the request completed.');
      // The backend's own events usually report the change already; emit only what remains unreported.
      const chainChanged = actual !== this.chainId;
      const accountsChanged = !sameAccounts(accounts, this.accounts);
      this.chainId = actual;
      this.accounts = accounts;
      if (chainChanged) this.emit('chainChanged', hexChainId(actual));
      if (this.backend !== backend || revision !== this.revision) throw new ProviderRpcError(4900, 'Wallet disconnected before the request completed.');
      if (accountsChanged) this.emit('accountsChanged', [...accounts]);
      return result;
    }
    const result = await backend.request<T>(args);
    if (this.backend !== backend || revision !== this.revision) throw new ProviderRpcError(4900, 'Wallet disconnected before the request completed.');
    return result;
  }

  /**
   * Local disconnection always completes. Wallet-side revocation is best effort: once the local
   * session pointer is cleared, a failed revocation (for example while offline) cannot be retried.
   */
  async disconnect(): Promise<void> {
    this.cancel();
    const remote = this.remote;
    const pendingRemote = this.remotePromise;
    this.clearConnection();
    if (remote) await remote.disconnect().catch(() => undefined);
    else if (pendingRemote) {
      // A retry waits for cleanup of the initialization already in flight.
      // This prevents cleanup from revoking a newer attempt's session.
      const cleanup = pendingRemote.then(async (initialized) => { await initialized.disconnect().catch(() => undefined); return initialized; });
      this.remotePromise = cleanup.catch((error) => { this.remotePromise = undefined; throw error; });
      await this.remotePromise.catch(() => undefined);
    }
  }

  /** Release listeners/UI without revoking a deliberately persisted approved session. */
  destroy(): void {
    this.cancel();
    this.destroyed = true;
    this.unbind();
    this.backend = undefined;
    this.accounts = [];
    this.currentStatus = 'idle';
    this.currentTransport = undefined;
    this.remote?.destroy();
    this.clearListeners();
  }
}
