import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import type SignClient from '@walletconnect/sign-client';
import {sharedSignClient, WalletConnectTransport} from '../packages/core/src/transport.js';
import {RobinhoodProvider} from '../packages/core/src/provider.js';
import type {RobinhoodProviderOptions, SessionStorage} from '../packages/core/src/types.js';

const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const URI = `wc:${'a'.repeat(64)}@2?relay-protocol=irn&symKey=${'b'.repeat(64)}`;
const options: RobinhoodProviderOptions = {projectId: 'fixture', chains: [1, 10], metadata: {name: 'Fixture', description: 'Synthetic SignClient contract fixture', url: 'https://example.test', icons: []}, showModal: false};
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((res, rej) => {resolve = res; reject = rej;}); return {promise, resolve, reject};}
type Session = ReturnType<SignClient['session']['get']>;
function session(topic = 'approved'): Session {
  return {topic, expiry: Math.floor(Date.now() / 1000) + 3600, namespaces: {eip155: {accounts: [`eip155:1:${A}`, `eip155:1:${B}`, `eip155:10:${A}`], methods: ['personal_sign', 'wallet_switchEthereumChain'], events: ['accountsChanged', 'chainChanged']}}} as unknown as Session;
}
function storage(): SessionStorage {const map = new Map<string, string>(); return {getItem: (k) => map.get(k) ?? null, setItem: (k,v) => {map.set(k,v);}, removeItem: (k) => {map.delete(k);}};}
class Client extends EventEmitter {
  pending: Array<ReturnType<typeof deferred<Session>>> = [];
  sessions = new Map<string, Session>();
  disconnected: string[] = [];
  pairings: string[] = [];
  requests: unknown[] = [];
  pendingRequest?: ReturnType<typeof deferred<unknown>>;
  session = {get: (topic: string) => {const found = this.sessions.get(topic); if (!found) throw new Error('Missing'); return found;}};
  core = {pairing: {disconnect: async ({topic}: {topic: string}) => {this.pairings.push(topic);}}};
  async connect() {const approval = deferred<Session>(); this.pending.push(approval); return {uri: URI, approval: () => approval.promise};}
  async requestError(error: unknown) {this.request = async (args: unknown) => {this.requests.push(args); throw error;};}
  async disconnect({topic}: {topic: string}) {this.disconnected.push(topic); this.sessions.delete(topic);}
  async request(args: unknown) {this.requests.push(args); return this.pendingRequest ? await this.pendingRequest.promise : 'actual-wallet-result';}
  approve(index = 0, value = session()) {this.sessions.set(value.topic, value); this.pending[index].resolve(value);}
}
function setup() {const client = new Client(); const store = storage(); const remote = new WalletConnectTransport(client as unknown as SignClient, options, store); return {client, store, remote};}
async function connect(remote: WalletConnectTransport, client: Client) {const controller = new AbortController(); const pending = remote.connect({signal: controller.signal, onUri() {}}); await tick(); client.approve(); await pending; return controller;}

test('remote proposal exposes only a validated local URI and actual authorized account/network result', async () => {
  const {client, remote} = setup(); const controller = new AbortController(); let uri = '';
  const pending = remote.connect({signal: controller.signal, onUri: (value) => {uri = value;}}); await tick(); assert.equal(uri, URI);
  client.approve(); assert.deepEqual(await pending, {accounts: [A, B], chainId: 1});
  assert.equal(await remote.request({method: 'personal_sign', params: ['fixture', A]}), 'actual-wallet-result');
  await assert.rejects(remote.request({method: 'eth_sendTransaction', params: []}), {code: 4200});
  await remote.disconnect(); remote.destroy();
});

test('cancelled late approval is revoked by exact topic and never persisted or exposed', async () => {
  const {client, store, remote} = setup(); const controller = new AbortController();
  const pending = remote.connect({signal: controller.signal, onUri() {}}); await tick(); controller.abort(); client.approve();
  await assert.rejects(pending, {code: 4001}); assert.deepEqual(client.disconnected, ['approved']);
  assert.equal(store.getItem('vexi-robinhood-fixture:approved-session'), null);
  await assert.rejects(remote.request({method: 'eth_accounts'}), {code: 4900}); remote.destroy();
});

test('late old approval cannot disconnect or overwrite a newer session', async () => {
  const {client, store, remote} = setup(); const old = new AbortController(); const next = new AbortController();
  const first = remote.connect({signal: old.signal, onUri() {}}); await tick(); old.abort();
  const second = remote.connect({signal: next.signal, onUri() {}}); await tick(); client.approve(1, session('new')); await second;
  client.approve(0, session('old')); await assert.rejects(first, {code: 4001});
  assert.deepEqual(client.disconnected, ['old']); assert.equal(JSON.parse(store.getItem('vexi-robinhood-fixture:approved-session')!).topic, 'new');
  assert.deepEqual(await remote.request({method: 'eth_accounts'}), [A, B]); await remote.disconnect(); remote.destroy();
});

test('cancel in the approval-to-host-adoption microtask gap revokes the approved session', async () => {
  const {client, store, remote} = setup();
  const provider = new RobinhoodProvider(options, {storage: store, discover: async () => undefined, remote: async () => remote});
  const pending = provider.connect(); await tick(); client.approve(); queueMicrotask(() => provider.cancel());
  await assert.rejects(pending, {code: 4001}); await tick();
  assert.equal(provider.status, 'idle'); assert.deepEqual(client.disconnected, ['approved']);
  assert.equal(store.getItem('vexi-robinhood-fixture:approved-session'), null);
  await assert.rejects(remote.request({method: 'eth_accounts'}), {code: 4900}); provider.destroy();
});

test('account event, eth_accounts and restored selection stay consistent and scoped', async () => {
  const {client, store, remote} = setup(); await connect(remote, client);
  let event: unknown; remote.on('accountsChanged', (value) => {event = value;});
  client.emit('session_event', {topic: 'approved', params: {chainId: 'eip155:1', event: {name: 'accountsChanged', data: [B]}}});
  assert.deepEqual(event, [B]); assert.deepEqual(await remote.request({method: 'eth_accounts'}), [B]); remote.destroy();
  const restored = new WalletConnectTransport(client as unknown as SignClient, options, store);
  assert.deepEqual(await restored.restore(), {accounts: [B], chainId: 1});
  await restored.disconnect(); restored.destroy();
});

test('unapproved accounts and networks disconnect rather than expanding session permissions', async () => {
  const {client, remote} = setup(); await connect(remote, client);
  client.emit('session_event', {topic: 'approved', params: {chainId: 'eip155:1', event: {name: 'accountsChanged', data: ['0x3333333333333333333333333333333333333333']}}});
  await assert.rejects(remote.request({method: 'eth_accounts'}), {code: 4900}); assert.deepEqual(client.disconnected, ['approved']); remote.destroy();
});

test('switching between session-approved chains is local, like UniversalProvider, and needs no wallet method', async () => {
  const {client, remote} = setup(); const controller = new AbortController();
  const pending = remote.connect({signal: controller.signal, onUri() {}}); await tick();
  const approved = session(); approved.namespaces.eip155.methods = ['personal_sign']; client.approve(0, approved); await pending;
  const events: string[] = [];
  remote.on('chainChanged', (chain: string) => events.push(`chain:${chain}`)); remote.on('accountsChanged', (accounts: string[]) => events.push(`accounts:${accounts.join()}`));
  assert.equal(await remote.request({method: 'wallet_switchEthereumChain', params: [{chainId: '0xa'}]}), null);
  assert.deepEqual(client.requests, []); assert.deepEqual(events, ['chain:0xa', `accounts:${A}`]);
  assert.equal(await remote.request({method: 'eth_chainId'}), '0xa');
  await remote.request({method: 'personal_sign', params: ['0x00', A]});
  assert.equal((client.requests[0] as {chainId: string}).chainId, 'eip155:10');
  await remote.disconnect(); remote.destroy();
});

test('a chain removed by session_update can no longer be selected', async () => {
  const {client, remote} = setup(); await connect(remote, client);
  const remaining = session().namespaces; remaining.eip155.accounts = [`eip155:1:${A}`];
  client.emit('session_update', {topic: 'approved', params: {namespaces: remaining}});
  await assert.rejects(remote.request({method: 'wallet_switchEthereumChain', params: [{chainId: '0xa'}]}), {code: 4901});
  assert.equal(await remote.request({method: 'eth_chainId'}), '0x1'); assert.deepEqual(client.requests, []);
  await remote.disconnect(); remote.destroy();
});

test('session events accept CAIP-2 chains and CAIP-10 accounts without widening permissions', async () => {
  const {client, remote} = setup(); await connect(remote, client); const events: string[] = [];
  remote.on('chainChanged', (chain: string) => events.push(`chain:${chain}`)); remote.on('disconnect', () => events.push('disconnect'));
  const emit = (chainId: string, name: string, data: unknown) => client.emit('session_event', {topic: 'approved', params: {chainId, event: {name, data}}});
  emit('eip155:1', 'chainChanged', 'eip155:10');
  assert.equal(await remote.request({method: 'eth_chainId'}), '0xa');
  emit('eip155:10', 'accountsChanged', [`eip155:10:${A}`]);
  assert.deepEqual(await remote.request({method: 'eth_accounts'}), [A]);
  emit('eip155:10', 'chainChanged', 1);
  emit('eip155:1', 'accountsChanged', [`eip155:1:${B}`]);
  assert.deepEqual(await remote.request({method: 'eth_accounts'}), [B]); assert.deepEqual(events, ['chain:0xa', 'chain:0x1']); assert.deepEqual(client.disconnected, []);
  emit('eip155:1', 'accountsChanged', ['eip155:1:0x3333333333333333333333333333333333333333']);
  assert.deepEqual(client.disconnected, ['approved']); assert.deepEqual(events.at(-1), 'disconnect'); remote.destroy();
});

test('a wallet session extension keeps requests available past the original expiry', async (t) => {
  const {client, remote} = setup(); await connect(remote, client);
  t.mock.timers.enable({apis: ['Date'], now: Date.now()});
  // SignClient stores the extended expiry before emitting session_extend.
  client.sessions.set('approved', {...client.sessions.get('approved')!, expiry: Math.floor(Date.now() / 1000) + 7200});
  client.emit('session_extend', {id: 1, topic: 'approved'});
  t.mock.timers.tick(3_700_000);
  assert.equal(await remote.request({method: 'personal_sign', params: ['0x00', A]}), 'actual-wallet-result');
  t.mock.timers.tick(3_600_000);
  await assert.rejects(remote.request({method: 'personal_sign', params: ['0x00', A]}), {code: 4900}); remote.destroy();
});

test('disconnect and wallet deletion also release the session pairing', async () => {
  const {client, remote} = setup();
  const first = remote.connect({signal: new AbortController().signal, onUri() {}}); await tick();
  client.approve(0, {...session(), pairingTopic: 'pairing-1'} as Session); await first;
  await remote.disconnect(); assert.deepEqual(client.disconnected, ['approved']); assert.deepEqual(client.pairings, ['pairing-1']);
  const second = remote.connect({signal: new AbortController().signal, onUri() {}}); await tick();
  client.approve(1, {...session('next'), pairingTopic: 'pairing-2'} as Session); await second;
  client.emit('session_delete', {topic: 'next'});
  assert.deepEqual(client.pairings, ['pairing-1', 'pairing-2']); remote.destroy();
});

test('restore adopts only the saved topic, stays within its approval, and revokes a session no configured chain can use', async () => {
  const key = 'vexi-robinhood-fixture:approved-session';
  const {client, store, remote} = setup(); client.sessions.set('unrelated', session('unrelated'));
  assert.equal(await remote.restore(), undefined);
  // A saved chain the app no longer configures falls back to another chain the session approved.
  store.setItem(key, JSON.stringify({topic: 'unrelated', chainId: 99, accounts: [B]}));
  assert.deepEqual(await remote.restore(), {accounts: [B], chainId: 1}); assert.equal(JSON.parse(store.getItem(key)!).chainId, 1);
  assert.deepEqual(client.disconnected, []); remote.destroy();
  const other = setup(); const foreign = session('foreign'); foreign.namespaces.eip155.accounts = [`eip155:137:${A}`];
  other.client.sessions.set('foreign', foreign); other.store.setItem(key, JSON.stringify({topic: 'foreign', chainId: 137}));
  assert.equal(await other.remote.restore(), undefined); assert.equal(other.store.getItem(key), null); assert.deepEqual(other.client.disconnected, ['foreign']);
  const expired = session('expired'); expired.expiry = 1; other.client.sessions.set('expired', expired);
  other.store.setItem(key, JSON.stringify({topic: 'expired', chainId: 1}));
  assert.equal(await other.remote.restore(), undefined); assert.equal(other.store.getItem(key), null); assert.deepEqual(other.client.disconnected, ['foreign']);
  other.remote.destroy();
});

test('disconnect while transport initializes revokes the original stored topic before retry can pair', async () => {
  const {client, store, remote} = setup(); client.sessions.set('previous', session('previous'));
  store.setItem('vexi-robinhood-fixture:connected', 'walletConnect');
  store.setItem('vexi-robinhood-fixture:approved-session', JSON.stringify({topic: 'previous', chainId: 1}));
  const initializing = deferred<WalletConnectTransport>();
  const provider = new RobinhoodProvider(options, {storage: store, discover: async () => undefined, remote: () => initializing.promise});
  const restoring = provider.isAuthorized(); await tick(); const disconnecting = provider.disconnect();
  const retry = provider.connect(); initializing.resolve(remote); await disconnecting; assert.equal(await restoring, false); await tick();
  assert.deepEqual(client.disconnected, ['previous']); client.approve(0, session('retry')); await retry;
  assert.equal(provider.status, 'connected'); assert.equal(JSON.parse(store.getItem('vexi-robinhood-fixture:approved-session')!).topic, 'retry');
  await provider.disconnect(); provider.destroy();
});

test('a session update keeps the wallet-selected account while it stays approved', async () => {
  const {client, store, remote} = setup(); await connect(remote, client); const events: string[] = [];
  remote.on('accountsChanged', (accounts: string[]) => events.push(`accounts:${accounts.join()}`));
  client.emit('session_event', {topic: 'approved', params: {chainId: 'eip155:1', event: {name: 'accountsChanged', data: [B]}}});
  client.emit('session_update', {topic: 'approved', params: {namespaces: session().namespaces}});
  assert.deepEqual(await remote.request({method: 'eth_accounts'}), [B]); assert.deepEqual(JSON.parse(store.getItem('vexi-robinhood-fixture:approved-session')!).accounts, [B]);
  const remaining = session().namespaces; remaining.eip155.accounts = [`eip155:1:${A}`, `eip155:10:${A}`];
  client.emit('session_update', {topic: 'approved', params: {namespaces: remaining}});
  assert.deepEqual(await remote.request({method: 'eth_accounts'}), [A]); assert.deepEqual(events, [`accounts:${B}`, `accounts:${A}`]);
  remote.destroy();
});

test('wallet rejections use EIP-1193 code 4001 and keep the WalletConnect error as data', async () => {
  const {client, remote} = setup(); const walletError = {message: 'User rejected.', code: 5000};
  const pending = remote.connect({signal: new AbortController().signal, onUri() {}}); await tick(); client.pending[0].reject(walletError);
  await assert.rejects(pending, (error: {code?: number; data?: unknown}) => error.code === 4001 && error.data === walletError);
  const second = remote.connect({signal: new AbortController().signal, onUri() {}}); await tick(); client.approve(1); await second;
  await client.requestError(walletError);
  await assert.rejects(remote.request({method: 'personal_sign', params: ['0x00', A]}), (error: {code?: number; data?: unknown}) => error.code === 4001 && error.data === walletError);
  const internal = {message: 'Session request failed', code: -32603}; await client.requestError(internal);
  await assert.rejects(remote.request({method: 'personal_sign', params: ['0x00', A]}), (error) => error === internal);
  remote.destroy();
});

test('one SignClient serves every transport for a storage prefix; a failed initialization can be retried', async () => {
  let created = 0; const client = new Client() as unknown as SignClient;
  const init = async () => {created++; return client;};
  const first = sharedSignClient('test-shared-prefix', init); const second = sharedSignClient('test-shared-prefix', init);
  assert.equal(first, second); assert.equal(await first, client); assert.equal(created, 1);
  assert.notEqual(sharedSignClient('test-other-prefix', init), first); assert.equal(created, 2);
  const failing = sharedSignClient('test-failing-prefix', async () => {throw new Error('Synthetic init failure');});
  await assert.rejects(failing, /Synthetic init failure/); await tick();
  assert.equal(await sharedSignClient('test-failing-prefix', init), client);
});
