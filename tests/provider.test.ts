import test from 'node:test';
import assert from 'node:assert/strict';
import {RobinhoodProvider} from '../packages/core/src/provider.js';
import {ProviderEmitter} from '../packages/core/src/emitter.js';
import type {ConnectionResult, RemoteTransport, RequestArguments, RobinhoodProviderOptions, SessionStorage} from '../packages/core/src/types.js';

const ADDRESS = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const options: RobinhoodProviderOptions = {projectId: 'fixture', chains: [1, 10], metadata: {name: 'Fixture', description: 'Synthetic unit test', url: 'https://example.test', icons: []}, showModal: false};
const result = {accounts: [ADDRESS], chainId: 1};
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((res, rej) => {resolve = res; reject = rej;}); return {promise, resolve, reject}; }
function storage(): SessionStorage { const values = new Map<string, string>(); return {getItem: (key) => values.get(key) ?? null, setItem: (key, value) => {values.set(key, value);}, removeItem: (key) => {values.delete(key);}}; }

class Injected extends ProviderEmitter {
  calls: RequestArguments[] = [];
  chain = '0x1';
  accounts = [ADDRESS];
  approval?: Promise<string[]>;
  switchError?: Error;
  send(event: string, value: unknown) { this.emit(event, value); }
  async request<T = unknown>(args: RequestArguments): Promise<T> {
    this.calls.push(args);
    if (args.method === 'eth_requestAccounts') return (this.approval ? await this.approval : this.accounts) as T;
    if (args.method === 'eth_accounts') return this.accounts as T;
    if (args.method === 'eth_chainId') return this.chain as T;
    if (args.method === 'wallet_switchEthereumChain') {
      if (this.switchError) throw this.switchError;
      this.chain = ((args.params as {chainId: string}[])[0]).chainId;
      this.emit('chainChanged', this.chain);
      return null as T;
    }
    return 'wallet-result' as T;
  }
}

class Remote extends Injected implements RemoteTransport {
  pending: Array<ReturnType<typeof deferred<ConnectionResult>>> = [];
  signals: AbortSignal[] = [];
  disconnected = 0;
  restored?: Promise<ConnectionResult | undefined>;
  connect({signal, onUri}: {signal: AbortSignal; onUri: (uri: string) => void}): Promise<ConnectionResult> {
    this.signals.push(signal);
    const next = deferred<ConnectionResult>(); this.pending.push(next);
    onUri('fixture-uri');
    return next.promise;
  }
  async restore() { return this.restored ? await this.restored : undefined; }
  async disconnect() { this.disconnected++; }
  destroy() {}
}

test('constructor, getProvider-style reads and unapproved restoration never request accounts', async () => {
  const injected = new Injected(); let discovered = 0;
  const provider = new RobinhoodProvider(options, {discover: async () => {discovered++; return injected;}, storage: storage()});
  assert.equal(await provider.getChainId(), 1);
  assert.deepEqual(await provider.request({method: 'eth_accounts'}), []);
  assert.equal(await provider.isAuthorized(), false);
  assert.equal(discovered, 0);
  assert.equal(injected.calls.length, 0);
});

test('explicit injected connect is single flight and returns actual wallet accounts and chain', async () => {
  const injected = new Injected(); injected.chain = '0xa';
  const approval = deferred<string[]>(); injected.approval = approval.promise;
  const provider = new RobinhoodProvider(options, {discover: async () => injected, storage: storage()});
  const first = provider.connect(); assert.equal(provider.connect(), first);
  await tick(); assert.equal(injected.calls.length, 1);
  approval.resolve([ADDRESS]); assert.deepEqual(await first, {accounts: [ADDRESS], chainId: 10});
  assert.equal(provider.status, 'connected'); assert.equal(provider.transport, 'injected');
  await provider.disconnect(); assert.deepEqual(await provider.getAccounts(), []);
});

test('cancel settles immediately; late injected approval cannot revive old or replace newer attempt', async () => {
  const injected = new Injected(); const approval = deferred<string[]>(); injected.approval = approval.promise;
  const provider = new RobinhoodProvider(options, {discover: async () => injected, storage: storage()});
  const first = provider.connect(); await tick(); provider.cancel();
  await assert.rejects(first, {code: 4001});
  injected.approval = undefined; injected.accounts = [OTHER];
  assert.deepEqual(await provider.connect(), {accounts: [OTHER], chainId: 1});
  approval.resolve([ADDRESS]); await tick();
  assert.deepEqual(await provider.getAccounts(), [OTHER]);
  assert.equal(injected.calls.filter((call) => call.method === 'eth_requestAccounts').length, 2);
  provider.destroy();
});

test('cancel during remote initialization never opens a late pairing; retry reuses initialized transport safely', async () => {
  const loading = deferred<RemoteTransport>(); const remote = new Remote();
  const provider = new RobinhoodProvider(options, {discover: async () => undefined, remote: () => loading.promise, storage: storage()});
  const first = provider.connect(); await tick(); provider.cancel(); await assert.rejects(first, {code: 4001});
  loading.resolve(remote); await tick(); assert.equal(remote.pending.length, 0);
  const retry = provider.connect(); await tick(); remote.pending[0].resolve(result);
  assert.deepEqual(await retry, result); await provider.disconnect(); assert.equal(remote.disconnected, 1);
});

test('old remote completion and URI callbacks cannot complete a new attempt', async () => {
  const remote = new Remote();
  const provider = new RobinhoodProvider(options, {discover: async () => undefined, remote: async () => remote, storage: storage()});
  const first = provider.connect(); await tick(); provider.cancel(); await assert.rejects(first, {code: 4001});
  assert.equal(remote.signals[0].aborted, true);
  const second = provider.connect(); await tick();
  remote.pending[0].resolve(result); await tick(); assert.equal(provider.status, 'connecting');
  remote.pending[1].resolve({accounts: [OTHER], chainId: 10});
  assert.deepEqual(await second, {accounts: [OTHER], chainId: 10}); provider.destroy();
});

test('connection rejection preserves the wallet error and releases the retry gate', async () => {
  const injected = new Injected(); const denied = Object.assign(new Error('Rejected by wallet'), {code: 4001});
  const approval = deferred<string[]>(); injected.approval = approval.promise;
  const provider = new RobinhoodProvider(options, {discover: async () => injected, storage: storage()});
  const first = provider.connect(); await tick(); approval.reject(denied);
  await assert.rejects(first, (error) => error === denied); assert.equal(provider.status, 'idle');
  injected.approval = undefined; await provider.connect(); provider.destroy();
});

test('timeout aborts remote operation and settles outward connection promise', async () => {
  const remote = new Remote();
  const provider = new RobinhoodProvider({...options, connectTimeoutMs: 20}, {discover: async () => undefined, remote: async () => remote, storage: storage()});
  await assert.rejects(provider.connect(), {code: 4001}); assert.equal(remote.signals[0].aborted, true); assert.equal(provider.status, 'idle');
  remote.pending[0].resolve(result); await tick(); assert.equal(provider.status, 'idle'); provider.destroy();
});

test('failed QR rendering aborts transport, shows error and rejects instead of remaining pending', async () => {
  const remote = new Remote(); let failed = 0; let closed = 0;
  const provider = new RobinhoodProvider({...options, showModal: true}, {discover: async () => undefined, remote: async () => remote, storage: storage(), modal: async () => ({open() {}, ready: async () => {throw new Error('QR unavailable');}, fail() {failed++;}, close() {closed++;}})});
  await assert.rejects(provider.connect(), /QR unavailable/); assert.equal(failed, 1); assert.equal(remote.signals[0].aborted, true);
  provider.cancel(); assert.equal(closed, 1);
  remote.pending[0].resolve(result); await tick(); assert.equal(provider.status, 'idle');
});

test('event forwarding is scoped to current provider and disconnect removes old listeners', async () => {
  const injected = new Injected(); const provider = new RobinhoodProvider(options, {discover: async () => injected, storage: storage()});
  const accounts: unknown[] = []; const chains: unknown[] = [];
  provider.on('accountsChanged', (value) => accounts.push(value)); provider.on('chainChanged', (value) => chains.push(value));
  await provider.connect(); injected.send('accountsChanged', [OTHER]); injected.send('chainChanged', 10);
  assert.deepEqual(await provider.getAccounts(), [OTHER]); assert.equal(await provider.getChainId(), 10); assert.deepEqual(chains, ['0xa']);
  await provider.disconnect(); const count = accounts.length; injected.send('accountsChanged', [ADDRESS]);
  assert.equal(accounts.length, count); assert.deepEqual(await provider.getAccounts(), []);
});

test('unsupported and rejected switching cannot report a changed chain', async () => {
  const injected = new Injected(); const provider = new RobinhoodProvider(options, {discover: async () => injected, storage: storage()});
  await provider.connect();
  await assert.rejects(provider.request({method: 'wallet_switchEthereumChain', params: [{chainId: '0x89'}]}), {code: 4901});
  injected.switchError = Object.assign(new Error('Declined'), {code: 4001});
  await assert.rejects(provider.request({method: 'wallet_switchEthereumChain', params: [{chainId: '0xa'}]}), {code: 4001});
  assert.equal(await provider.getChainId(), 1); provider.destroy();
});

test('initial connection uses the account selected by the wallet after a requested chain switch', async () => {
  const injected = new Injected(); const request = injected.request.bind(injected);
  injected.request = async <T = unknown>(args: RequestArguments): Promise<T> => {
    const response = await request<T>(args);
    if (args.method === 'wallet_switchEthereumChain') {injected.accounts = [OTHER]; injected.send('accountsChanged', [OTHER]);}
    return response;
  };
  const provider = new RobinhoodProvider(options, {discover: async () => injected, storage: storage()});
  assert.deepEqual(await provider.connect({chainId: 10}), {accounts: [OTHER], chainId: 10}); assert.deepEqual(await provider.getAccounts(), [OTHER]); provider.destroy();
});

test('session recovery is scoped by marker and cannot win over disconnect during restore', async () => {
  const store = storage(); const marker = 'vexi-robinhood-fixture:connected'; store.setItem(marker, 'walletConnect');
  const remote = new Remote(); const restoring = deferred<ConnectionResult | undefined>(); remote.restored = restoring.promise;
  const provider = new RobinhoodProvider(options, {discover: async () => undefined, remote: async () => remote, storage: store});
  const authorization = provider.isAuthorized(); await tick(); await provider.disconnect(); restoring.resolve(result);
  assert.equal(await authorization, false); assert.equal(provider.status, 'idle'); assert.equal(store.getItem(marker), null);
});

test('destroy during discovery settles once and forbids later account requests', async () => {
  const discovery = deferred<Injected | undefined>(); const injected = new Injected();
  const provider = new RobinhoodProvider(options, {discover: () => discovery.promise, storage: storage()});
  const connecting = provider.connect(); provider.destroy(); await assert.rejects(connecting, {code: 4001});
  discovery.resolve(injected); await tick(); assert.equal(injected.calls.length, 0); await assert.rejects(provider.connect(), {code: 4900});
});

test('a connect listener may disconnect without a stale nonempty account event afterward', async () => {
  const injected = new Injected(); const provider = new RobinhoodProvider(options, {discover: async () => injected, storage: storage()});
  const events: string[] = [];
  provider.on('connect', () => {events.push('connect'); void provider.disconnect();});
  provider.on('accountsChanged', (accounts: string[]) => events.push(`accounts:${accounts.length}`));
  provider.on('disconnect', () => events.push('disconnect'));
  await provider.connect(); assert.equal(provider.status, 'idle'); assert.deepEqual(events, ['connect', 'accounts:0', 'disconnect']);
});

test('consumer callback failures do not prevent settlement or later event consumers', async () => {
  const injected = new Injected(); const provider = new RobinhoodProvider(options, {discover: async () => injected, storage: storage()}); let connected = 0;
  provider.on('connect', () => {throw new Error('Consumer callback failure');}); provider.on('connect', () => {connected++;});
  assert.deepEqual(await provider.connect(), result); assert.equal(connected, 1); provider.destroy();
});

test('disconnect during post-switch chain read prevents stale account or chain writes', async () => {
  const injected = new Injected(); const original = injected.request.bind(injected); const chainRead = deferred<string>(); let switching = false;
  injected.request = async <T = unknown>(args: RequestArguments): Promise<T> => {
    if (args.method === 'wallet_switchEthereumChain') {switching = true; return null as T;}
    if (switching && args.method === 'eth_chainId') return await chainRead.promise as T;
    return original<T>(args);
  };
  const provider = new RobinhoodProvider(options, {discover: async () => injected, storage: storage()}); await provider.connect();
  const request = provider.request({method: 'wallet_switchEthereumChain', params: [{chainId: '0xa'}]}); await tick(); await provider.disconnect(); chainRead.resolve('0xa');
  await assert.rejects(request, {code: 4900}); assert.equal(provider.status, 'idle'); assert.deepEqual(await provider.getAccounts(), []); assert.equal(await provider.getChainId(), 1);
});
