import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import type SignClient from '@walletconnect/sign-client';
import {WalletConnectTransport} from '../packages/core/src/transport.js';
import {RobinhoodProvider} from '../packages/core/src/provider.js';
import type {RobinhoodProviderOptions, SessionStorage} from '../packages/core/src/types.js';

const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const URI = `wc:${'a'.repeat(64)}@2?relay-protocol=irn&symKey=${'b'.repeat(64)}`;
const options: RobinhoodProviderOptions = {projectId: 'fixture', chains: [1, 10], metadata: {name: 'Fixture', description: 'Synthetic SignClient contract fixture', url: 'https://example.test', icons: []}, showModal: false};
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {let resolve!: (value: T) => void; const promise = new Promise<T>((res) => {resolve = res;}); return {promise, resolve};}
type Session = ReturnType<SignClient['session']['get']>;
function session(topic = 'approved'): Session {
  return {topic, expiry: Math.floor(Date.now() / 1000) + 3600, namespaces: {eip155: {accounts: [`eip155:1:${A}`, `eip155:1:${B}`, `eip155:10:${A}`], methods: ['personal_sign', 'wallet_switchEthereumChain'], events: ['accountsChanged', 'chainChanged']}}} as Session;
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

test('chain permission removed while switching is revalidated after wallet response', async () => {
  const {client, remote} = setup(); await connect(remote, client); client.pendingRequest = deferred<unknown>();
  const switching = remote.request({method: 'wallet_switchEthereumChain', params: [{chainId: '0xa'}]});
  const remaining = session().namespaces; remaining.eip155.accounts = [`eip155:1:${A}`];
  client.emit('session_update', {topic: 'approved', params: {namespaces: remaining}});
  client.pendingRequest.resolve(null); await assert.rejects(switching, {code: 4901});
  assert.equal(await remote.request({method: 'eth_chainId'}), '0x1'); await remote.disconnect(); remote.destroy();
});

test('only the explicitly approved topic may be restored; expired and invalid markers are rejected', async () => {
  const {client, store, remote} = setup(); client.sessions.set('unrelated', session('unrelated'));
  assert.equal(await remote.restore(), undefined);
  store.setItem('vexi-robinhood-fixture:approved-session', JSON.stringify({topic: 'unrelated', chainId: 99}));
  assert.equal(await remote.restore(), undefined); assert.equal(store.getItem('vexi-robinhood-fixture:approved-session'), null);
  const expired = session('expired'); expired.expiry = 1; client.sessions.set('expired', expired);
  store.setItem('vexi-robinhood-fixture:approved-session', JSON.stringify({topic: 'expired', chainId: 1}));
  assert.equal(await remote.restore(), undefined); remote.destroy();
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
