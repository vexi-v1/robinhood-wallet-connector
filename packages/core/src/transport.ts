import type SignClient from '@walletconnect/sign-client';
import { ProviderEmitter } from './emitter.js';
import { getRobinhoodUri } from './metadata.js';
import { hexChainId, includesAccount, parseAccounts, parseChainId, sameAccounts, storagePrefix } from './state.js';
import { ProviderRpcError } from './types.js';
import type { ConnectionResult, RemoteTransport, RequestArguments, RobinhoodProviderOptions, SessionStorage } from './types.js';

type Session = ReturnType<SignClient['session']['get']>;
const METHODS = ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData', 'eth_signTypedData_v4', 'wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_getPermissions', 'wallet_getCapabilities', 'wallet_sendCalls', 'wallet_getCallsStatus', 'wallet_showCallsStatus'];
const READ_METHODS = new Set(['eth_blockNumber', 'eth_call', 'eth_chainId', 'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory', 'eth_getBalance', 'eth_getCode', 'eth_getStorageAt', 'eth_getTransactionCount', 'eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_getLogs', 'net_version']);
const DISCONNECT = {code: 6000, message: 'User disconnected'};
/** WalletConnect USER_REJECTED and its chains, methods and events variants. */
const USER_REJECTED = new Set([5000, 5001, 5002, 5003]);

/** Reports a wallet's WalletConnect rejection with EIP-1193's 4001, keeping the original as data. */
function asUserRejection(error: unknown, message: string): unknown {
  const code = typeof error === 'object' && error !== null ? (error as {code?: unknown}).code : undefined;
  return typeof code === 'number' && USER_REJECTED.has(code) ? new ProviderRpcError(4001, message, error) : error;
}

/** chainChanged data may be a number, hex or decimal string, or CAIP-2 ID, as UniversalProvider accepts. */
function eventChainId(value: unknown): number {
  const caip = typeof value === 'string' ? /^eip155:(\d+)$/.exec(value) : null;
  return parseChainId(caip ? caip[1] : value);
}

/** accountsChanged entries may be addresses or eip155 CAIP-10 accounts; approval is checked separately. */
function eventAccounts(value: unknown): string[] {
  return parseAccounts(Array.isArray(value) ? value.map((entry) => {
    const parts = typeof entry === 'string' ? entry.split(':') : [];
    return parts.length === 3 && parts[0] === 'eip155' ? parts[2] : entry;
  }) : value);
}

/**
 * WalletConnect keeps one global Core per storage prefix, so a second SignClient for the same prefix
 * would add a second engine to that Core. Transports for a prefix therefore share one client per page.
 */
const signClients = new Map<string, Promise<SignClient>>();

export function sharedSignClient(prefix: string, init: () => Promise<SignClient>): Promise<SignClient> {
  let client = signClients.get(prefix);
  if (!client) {
    const created = init();
    signClients.set(prefix, created);
    created.catch(() => { if (signClients.get(prefix) === created) signClients.delete(prefix); });
    client = created;
  }
  return client;
}

/** Owns explicit session topics, never a shared framework modal or provider singleton. */
export class WalletConnectTransport extends ProviderEmitter implements RemoteTransport {
  private session?: Session;
  private chainId: number;
  private generation = 0;
  private readonly key: string;
  private destroyed = false;
  private accounts: string[] = [];
  private releaseSessionAbort?: () => void;

  static async create(options: RobinhoodProviderOptions, storage: SessionStorage): Promise<WalletConnectTransport> {
    const prefix = storagePrefix(options);
    const client = await sharedSignClient(prefix, async () => {
      const {SignClient} = await import('@walletconnect/sign-client');
      return SignClient.init({
        projectId: options.projectId,
        metadata: options.metadata,
        customStoragePrefix: prefix,
        telemetryEnabled: false,
        logger: 'silent',
      });
    });
    return new WalletConnectTransport(client, options, storage);
  }

  constructor(private readonly client: SignClient, private readonly options: RobinhoodProviderOptions, private readonly storage: SessionStorage) {
    super();
    this.chainId = options.chains[0];
    this.key = `${storagePrefix(options)}:approved-session`;
    client.on('session_delete', this.onDelete);
    client.on('session_expire', this.onDelete);
    client.on('session_update', this.onUpdate);
    client.on('session_event', this.onEvent);
    client.on('session_extend', this.onExtend);
  }

  private allowedChains(): number[] { return [...new Set([...this.options.chains, ...(this.options.optionalChains ?? [])])]; }

  private result(session: Session, requested?: number): ConnectionResult {
    const accounts = Object.entries(session.namespaces)
      .filter(([namespace]) => namespace === 'eip155' || namespace.startsWith('eip155:'))
      .flatMap(([, namespace]) => namespace.accounts);
    const supported = this.allowedChains();
    const parsed = accounts.map((account) => {
      const [namespace, chain, address] = account.split(':');
      if (namespace !== 'eip155') return undefined;
      return {chain: parseChainId(chain), address};
    }).filter((account) => account !== undefined && supported.includes(account.chain));
    const chain = requested ?? (parsed.some((account) => account?.chain === this.chainId) ? this.chainId : parsed[0]?.chain);
    if (!chain || !parsed.some((account) => account?.chain === chain)) throw new ProviderRpcError(4901, 'Robinhood Wallet has not approved the requested network.');
    const approvedAccounts = parseAccounts(parsed.filter((account) => account?.chain === chain).map((account) => account!.address));
    if (!approvedAccounts.length) throw new ProviderRpcError(4100, 'Robinhood Wallet did not approve an account.');
    return {accounts: approvedAccounts, chainId: chain};
  }

  /**
   * Applies an approved chain and account set. Like WalletConnect's EthereumProvider, a wallet-selected
   * account survives while it stays approved on an unchanged chain; only actual changes are emitted.
   */
  private select(result: ConnectionResult, topic: string): void {
    const kept = result.chainId === this.chainId ? this.accounts.filter((account) => includesAccount(result.accounts, account)) : [];
    const accounts = kept.length ? kept : result.accounts;
    const chainChanged = result.chainId !== this.chainId;
    const accountsChanged = !sameAccounts(accounts, this.accounts);
    this.chainId = result.chainId;
    this.accounts = [...accounts];
    this.persist();
    if (chainChanged) this.emit('chainChanged', hexChainId(result.chainId));
    if (accountsChanged && this.session?.topic === topic) this.emit('accountsChanged', [...this.accounts]);
  }

  async restore(): Promise<ConnectionResult | undefined> {
    if (this.destroyed) return;
    const stored = this.storage.getItem(this.key);
    if (!stored) return;
    let saved: {topic?: unknown; chainId?: unknown; accounts?: unknown};
    let session: Session;
    try {
      saved = JSON.parse(stored) ?? {};
      session = this.client.session.get(saved.topic as string);
      if (session.expiry <= Date.now() / 1000) throw new Error('Expired session');
    } catch {
      // A missing, expired or unreadable pointer authorizes nothing; WalletConnect expires sessions itself.
      this.storage.removeItem(this.key);
      return;
    }
    let result: ConnectionResult;
    try {
      // The saved chain may no longer be configured; fall back to another chain this session approved.
      try { result = this.result(session, parseChainId(saved.chainId)); } catch { result = this.result(session); }
      let selected: string[] = [];
      try { selected = parseAccounts(saved.accounts).filter((account) => includesAccount(result.accounts, account)); } catch { /* No saved selection. */ }
      if (selected.length) result = {...result, accounts: selected};
    } catch {
      // No configured chain is approved, so this app can never use the session: revoke, don't orphan it.
      this.storage.removeItem(this.key);
      void this.client.disconnect({topic: session.topic, reason: DISCONNECT}).catch(() => undefined);
      this.forgetPairing(session);
      return;
    }
    this.session = session;
    this.chainId = result.chainId;
    this.accounts = [...result.accounts];
    this.persist();
    return result;
  }

  async connect({chainId, signal, onUri}: {chainId?: number; signal: AbortSignal; onUri: (uri: string) => void}): Promise<ConnectionResult> {
    const generation = ++this.generation;
    const cancelled = () => this.destroyed || signal.aborted || generation !== this.generation;
    if (cancelled()) throw new ProviderRpcError(4001, 'Connection cancelled.');
    const {uri, approval} = await this.client.connect({
      optionalNamespaces: {eip155: {chains: this.allowedChains().map((id) => `eip155:${id}`), methods: METHODS, events: ['accountsChanged', 'chainChanged']}},
    });
    // Consume approval even after cancellation, so late wallet approval is explicitly disconnected.
    const approved = approval();
    let observedApproval = false;
    let pairingTopic: string | undefined;
    const cleanupPairing = () => {
      if (pairingTopic) void this.client.core.pairing.disconnect({topic: pairingTopic}).catch(() => undefined);
    };
    signal.addEventListener('abort', cleanupPairing, {once: true});
    try {
      if (uri) {
        getRobinhoodUri(uri);
        pairingTopic = uri.slice(3, uri.indexOf('@'));
        if (!cancelled()) onUri(uri);
      }
      if (cancelled()) cleanupPairing();
      const session = await approved;
      observedApproval = true;
      if (cancelled()) {
        await this.client.disconnect({topic: session.topic, reason: DISCONNECT}).catch(() => undefined);
        throw new ProviderRpcError(4001, 'Connection cancelled.');
      }
      let result: ConnectionResult;
      try { result = this.result(session, chainId); } catch (error) {
        await this.client.disconnect({topic: session.topic, reason: DISCONNECT}).catch(() => undefined);
        throw error;
      }
      this.session = session;
      this.chainId = result.chainId;
      this.accounts = [...result.accounts];
      this.releaseSessionAbort?.();
      const revokeApprovedAttempt = () => {
        // Approval can resolve one microtask before the host observes cancellation.
        // Revoke only this topic; never disconnect a later attempt's session.
        if (this.session?.topic === session.topic) {
          this.session = undefined;
          this.accounts = [];
          this.storage.removeItem(this.key);
        }
        void this.client.disconnect({topic: session.topic, reason: DISCONNECT}).catch(() => undefined);
      };
      signal.addEventListener('abort', revokeApprovedAttempt, {once: true});
      this.releaseSessionAbort = () => signal.removeEventListener('abort', revokeApprovedAttempt);
      this.persist();
      return result;
    } catch (error) {
      cleanupPairing();
      // If UI/URI processing threw before awaiting approval, still consume its late result.
      if (!observedApproval) void approved.then((session) => {
        if (session.topic !== this.session?.topic) return this.client.disconnect({topic: session.topic, reason: DISCONNECT});
      }).catch(() => undefined);
      throw asUserRejection(error, 'Robinhood Wallet rejected the connection.');
    } finally { signal.removeEventListener('abort', cleanupPairing); }
  }

  private persist(): void {
    if (this.session) this.storage.setItem(this.key, JSON.stringify({topic: this.session.topic, chainId: this.chainId, accounts: this.accounts}));
  }

  /** Each proposal creates its own pairing, so it belongs only to this session. */
  private forgetPairing(session: Session): void {
    if (session.pairingTopic) void this.client.core.pairing.disconnect({topic: session.pairingTopic}).catch(() => undefined);
  }

  private onDelete = ({topic}: {topic: string}) => {
    if (this.session?.topic !== topic) return;
    this.forgetPairing(this.session);
    this.session = undefined;
    this.accounts = [];
    this.releaseSessionAbort?.();
    this.releaseSessionAbort = undefined;
    this.storage.removeItem(this.key);
    this.emit('disconnect', new ProviderRpcError(4900, 'Robinhood Wallet disconnected.'));
  };

  private onExtend = ({topic}: {topic: string}) => {
    if (this.session?.topic !== topic) return;
    // SignClient stores the extended expiry before emitting; keep the owned snapshot current.
    try { this.session = {...this.session, expiry: this.client.session.get(topic).expiry}; } catch { /* session_delete reports a removed session. */ }
  };

  private onUpdate = ({topic, params}: {topic: string; params: {namespaces: Session['namespaces']}}) => {
    if (this.session?.topic !== topic) return;
    this.session = {...this.session, namespaces: params.namespaces};
    try { this.select(this.result(this.session), topic); }
    catch { void this.disconnect().catch(() => undefined); this.emit('disconnect', new ProviderRpcError(4100, 'Wallet session authorization changed.')); }
  };

  private onEvent = ({topic, params}: {topic: string; params: {chainId: string; event: {name: string; data: unknown}}}) => {
    if (this.session?.topic !== topic) return;
    const {event} = params;
    try {
      if (event.name === 'chainChanged') {
        this.select(this.result(this.session, eventChainId(event.data)), topic);
      } else if (event.name === 'accountsChanged') {
        if (params.chainId !== `eip155:${this.chainId}`) return;
        const accounts = eventAccounts(event.data);
        const approved = this.result(this.session, this.chainId).accounts;
        if (accounts.some((account) => !includesAccount(approved, account))) throw new Error('Unapproved account');
        if (!accounts.length) { void this.disconnect().catch(() => undefined); this.emit('disconnect', new ProviderRpcError(4100, 'Wallet account access was removed.')); return; }
        this.accounts = accounts;
        this.persist();
        this.emit('accountsChanged', [...accounts]);
      } else this.emit('message', {type: event.name, data: event.data});
    } catch { void this.disconnect().catch(() => undefined); this.emit('disconnect', new ProviderRpcError(4901, 'Wallet reported an unauthorized network or account.')); }
  };

  async request<T = unknown>(args: RequestArguments): Promise<T> {
    const session = this.session;
    if (!session || session.expiry <= Date.now() / 1000) throw new ProviderRpcError(4900, 'Connect Robinhood Wallet first.');
    if (args.method === 'eth_chainId') return hexChainId(this.chainId) as T;
    if (args.method === 'eth_accounts') return [...this.accounts] as T;
    if (READ_METHODS.has(args.method)) {
      const rpc = this.options.rpcMap?.[this.chainId];
      if (!rpc) throw new ProviderRpcError(4200, 'Configure an RPC URL for this network to make read requests.');
      let response: Response;
      try {
        response = await fetch(rpc, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method: args.method, params: args.params ?? []}), signal: AbortSignal.timeout(30_000)});
      } catch { throw new ProviderRpcError(-32000, 'The configured RPC endpoint is unavailable.'); }
      if (!response.ok) throw new ProviderRpcError(-32000, 'The configured RPC endpoint is unavailable.');
      let result: {result?: T; error?: {code: number; message: string; data?: unknown}};
      try {
        result = await response.json();
        if (!result || typeof result !== 'object') throw new Error('Not a JSON-RPC response');
      } catch { throw new ProviderRpcError(-32603, 'Invalid RPC response.'); }
      if (result.error) throw new ProviderRpcError(result.error.code, result.error.message, result.error.data);
      if (!('result' in result)) throw new ProviderRpcError(-32603, 'Invalid RPC response.');
      return result.result as T;
    }
    if (args.method === 'wallet_switchEthereumChain') {
      const param = Array.isArray(args.params) ? args.params[0] : undefined;
      // WalletConnect requests name their chain, so switching between session-approved chains is
      // local, as in WalletConnect's UniversalProvider. An unapproved chain is rejected here.
      this.select(this.result(session, parseChainId((param as {chainId?: unknown})?.chainId)), session.topic);
      return null as T;
    }
    const namespace = session.namespaces[`eip155:${this.chainId}`] ?? session.namespaces.eip155;
    if (!namespace?.methods.includes(args.method)) throw new ProviderRpcError(4200, 'Robinhood Wallet has not approved this method.');
    let result: T;
    try { result = await this.client.request<T>({topic: session.topic, chainId: `eip155:${this.chainId}`, request: {method: args.method, params: args.params ?? []}}); }
    catch (error) { throw asUserRejection(error, 'Robinhood Wallet rejected the request.'); }
    if (this.session?.topic !== session.topic) throw new ProviderRpcError(4900, 'Wallet disconnected before the request completed.');
    return result;
  }

  async disconnect(): Promise<void> {
    ++this.generation;
    let session = this.session;
    if (!session) {
      try {
        const saved = JSON.parse(this.storage.getItem(this.key) ?? '{}') as {topic?: string};
        if (saved.topic) session = this.client.session.get(saved.topic);
      } catch { /* A stale pointer does not authorize any other stored session. */ }
    }
    this.session = undefined;
    this.accounts = [];
    this.releaseSessionAbort?.();
    this.releaseSessionAbort = undefined;
    this.storage.removeItem(this.key);
    if (!session) return;
    try { await this.client.disconnect({topic: session.topic, reason: DISCONNECT}); }
    finally { this.forgetPairing(session); }
  }

  destroy(): void {
    this.destroyed = true;
    ++this.generation;
    this.releaseSessionAbort?.();
    this.releaseSessionAbort = undefined;
    this.client.removeListener('session_delete', this.onDelete);
    this.client.removeListener('session_expire', this.onDelete);
    this.client.removeListener('session_update', this.onUpdate);
    this.client.removeListener('session_event', this.onEvent);
    this.client.removeListener('session_extend', this.onExtend);
    this.clearListeners();
  }
}
