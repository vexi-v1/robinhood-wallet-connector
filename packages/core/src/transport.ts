import type SignClient from '@walletconnect/sign-client';
import { ProviderEmitter } from './emitter.js';
import { getRobinhoodUri } from './metadata.js';
import { hexChainId, parseAccounts, parseChainId } from './state.js';
import { ProviderRpcError } from './types.js';
import type { ConnectionResult, RemoteTransport, RequestArguments, RobinhoodProviderOptions, SessionStorage } from './types.js';

type Session = ReturnType<SignClient['session']['get']>;
const METHODS = ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData', 'eth_signTypedData_v4', 'wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_getPermissions', 'wallet_getCapabilities', 'wallet_sendCalls', 'wallet_getCallsStatus', 'wallet_showCallsStatus'];
const READ_METHODS = new Set(['eth_blockNumber', 'eth_call', 'eth_chainId', 'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory', 'eth_getBalance', 'eth_getCode', 'eth_getStorageAt', 'eth_getTransactionCount', 'eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_getLogs', 'net_version']);
const DISCONNECT = {code: 6000, message: 'User disconnected'};

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
    const {SignClient} = await import('@walletconnect/sign-client');
    const client = await SignClient.init({
      projectId: options.projectId,
      metadata: options.metadata,
      customStoragePrefix: options.storagePrefix ?? `vexi-robinhood-${options.projectId}`,
      telemetryEnabled: false,
      logger: 'silent',
    });
    return new WalletConnectTransport(client, options, storage);
  }

  constructor(private readonly client: SignClient, private readonly options: RobinhoodProviderOptions, private readonly storage: SessionStorage) {
    super();
    this.chainId = options.chains[0];
    this.key = `${options.storagePrefix ?? `vexi-robinhood-${options.projectId}`}:approved-session`;
    client.on('session_delete', this.onDelete);
    client.on('session_expire', this.onDelete);
    client.on('session_update', this.onUpdate);
    client.on('session_event', this.onEvent);
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

  async restore(): Promise<ConnectionResult | undefined> {
    if (this.destroyed) return;
    const stored = this.storage.getItem(this.key);
    if (!stored) return;
    try {
      const {topic, chainId, accounts} = JSON.parse(stored) as {topic: string; chainId: number; accounts?: string[]};
      const session = this.client.session.get(topic);
      if (session.expiry <= Date.now() / 1000) throw new Error('Expired session');
      const result = this.result(session, chainId);
      if (accounts) {
        const saved = parseAccounts(accounts);
        if (!saved.length || saved.some((account) => !result.accounts.some((approved) => approved.toLowerCase() === account.toLowerCase()))) throw new Error('Invalid saved account authorization');
        result.accounts = saved;
      }
      this.session = session;
      this.chainId = result.chainId;
      this.accounts = [...result.accounts];
      return result;
    } catch {
      this.storage.removeItem(this.key);
      return;
    }
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
      throw error;
    } finally { signal.removeEventListener('abort', cleanupPairing); }
  }

  private persist(): void {
    if (this.session) this.storage.setItem(this.key, JSON.stringify({topic: this.session.topic, chainId: this.chainId, accounts: this.accounts}));
  }

  private onDelete = ({topic}: {topic: string}) => {
    if (this.session?.topic !== topic) return;
    this.session = undefined;
    this.accounts = [];
    this.releaseSessionAbort?.();
    this.releaseSessionAbort = undefined;
    this.storage.removeItem(this.key);
    this.emit('disconnect', new ProviderRpcError(4900, 'Robinhood Wallet disconnected.'));
  };

  private onUpdate = ({topic, params}: {topic: string; params: {namespaces: Session['namespaces']}}) => {
    if (this.session?.topic !== topic) return;
    this.session = {...this.session, namespaces: params.namespaces};
    try {
      const result = this.result(this.session);
      const changed = result.chainId !== this.chainId;
      this.chainId = result.chainId;
      this.accounts = [...result.accounts];
      this.persist();
      if (changed) this.emit('chainChanged', hexChainId(result.chainId));
      if (this.session?.topic === topic) this.emit('accountsChanged', [...this.accounts]);
    } catch { void this.disconnect().catch(() => undefined); this.emit('disconnect', new ProviderRpcError(4100, 'Wallet session authorization changed.')); }
  };

  private onEvent = ({topic, params}: {topic: string; params: {chainId: string; event: {name: string; data: unknown}}}) => {
    if (this.session?.topic !== topic) return;
    const {event} = params;
    try {
      if (event.name === 'chainChanged') {
        const chain = parseChainId(event.data);
        const result = this.result(this.session, chain);
        this.chainId = result.chainId;
        this.accounts = [...result.accounts];
        this.persist();
        this.emit('chainChanged', hexChainId(chain));
        if (this.session?.topic === topic) this.emit('accountsChanged', [...this.accounts]);
      } else if (event.name === 'accountsChanged') {
        if (params.chainId !== `eip155:${this.chainId}`) return;
        const accounts = parseAccounts(event.data);
        const approved = this.result(this.session, this.chainId).accounts;
        if (accounts.some((account) => !approved.some((allowed) => allowed.toLowerCase() === account.toLowerCase()))) throw new Error('Unapproved account');
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
      const response = await fetch(rpc, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method: args.method, params: args.params ?? []}), signal: AbortSignal.timeout(30_000)});
      if (!response.ok) throw new ProviderRpcError(-32000, 'The configured RPC endpoint is unavailable.');
      const result = await response.json() as {result?: T; error?: {code: number; message: string; data?: unknown}};
      if (result.error) throw new ProviderRpcError(result.error.code, result.error.message, result.error.data);
      if (!('result' in result)) throw new ProviderRpcError(-32603, 'Invalid RPC response.');
      return result.result as T;
    }
    const namespace = session.namespaces[`eip155:${this.chainId}`] ?? session.namespaces.eip155;
    if (!namespace?.methods.includes(args.method)) throw new ProviderRpcError(4200, 'Robinhood Wallet has not approved this method.');
    let targetChain: number | undefined;
    if (args.method === 'wallet_switchEthereumChain') {
      const param = Array.isArray(args.params) ? args.params[0] : undefined;
      targetChain = parseChainId((param as {chainId?: unknown})?.chainId);
      this.result(session, targetChain);
    }
    const result = await this.client.request<T>({topic: session.topic, chainId: `eip155:${this.chainId}`, request: {method: args.method, params: args.params ?? []}});
    if (this.session?.topic !== session.topic) throw new ProviderRpcError(4900, 'Wallet disconnected before the request completed.');
    if (targetChain) {
      const approved = this.result(this.session, targetChain);
      this.chainId = targetChain;
      this.accounts = approved.accounts;
      this.persist();
      this.emit('chainChanged', hexChainId(targetChain));
      if (this.session?.topic === session.topic) this.emit('accountsChanged', [...this.accounts]);
    }
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
    if (session) await this.client.disconnect({topic: session.topic, reason: DISCONNECT});
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
    this.clearListeners();
  }
}
