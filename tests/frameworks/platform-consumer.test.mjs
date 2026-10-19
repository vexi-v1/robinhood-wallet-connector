import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const platform = manifest.name.replace('robinhood-example-', '');
const account = '0x0000000000000000000000000000000000000001';
const otherAccount = '0x0000000000000000000000000000000000000002';
const options = {
  projectId: '00000000000000000000000000000000', chains: [1, 10], showModal: false, discoveryTimeoutMs: 1,
  metadata: { name: 'Synthetic consumer', description: 'No real wallets', url: 'https://example.test', icons: [] },
};
// Upstream telemetry and configuration requests stay inside this synthetic process.
globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).includes('wallet-book') ? { groups: {}, wallets: {} } : {}), { status: 200, headers: { 'Content-Type': 'application/json' } });
class SyntheticWallet extends EventEmitter {
  isRobinhoodMobileWallet = true;
  accounts = [];
  chainId = 1;
  prompts = 0;
  signatures = 0;
  pendingApproval;
  pendingSignature;
  rejection;
  async request({ method, params }) {
    if (method === 'eth_accounts') return [...this.accounts];
    if (method === 'eth_chainId') return `0x${this.chainId.toString(16)}`;
    if (method === 'eth_requestAccounts') {
      ++this.prompts;
      if (this.pendingApproval) await this.pendingApproval;
      if (this.rejection) throw this.rejection;
      this.accounts = [account];
      return [...this.accounts];
    }
    if (method === 'wallet_switchEthereumChain') {
      this.chainId = Number(params[0].chainId);
      this.emit('chainChanged', `0x${this.chainId.toString(16)}`);
      return null;
    }
    if (method === 'personal_sign' && platform === 'privy') {
      ++this.signatures;
      if (this.pendingSignature) await this.pendingSignature;
      if (this.rejection) throw this.rejection;
      return `0x${'00'.repeat(65)}`; // A deliberately invalid synthetic signature, never sent to a service.
    }
    throw Object.assign(new Error('Unexpected synthetic request'), { code: 4200 });
  }
}
function installWallet() {
  const wallet = new SyntheticWallet();
  globalThis.window = Object.assign(new EventTarget(), { ethereum: wallet });
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  return wallet;
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
async function until(predicate) {
  for (let attempt = 0; !predicate() && attempt < 100; attempt++) await pause();
  assert.ok(predicate(), 'Expected synthetic operation to start');
}
function assertClean(wallet) {
  for (const event of ['accountsChanged', 'chainChanged', 'disconnect', 'message']) assert.equal(wallet.listenerCount(event), 0);
}
async function createConnection(overrides = {}) {
  const configuration = { ...options, ...overrides };
  if (platform === 'thirdweb') {
    const { robinhoodWallet } = await import('@vexi/robinhood-wallet-thirdweb');
    const { createThirdwebClient } = await import('thirdweb');
    const client = createThirdwebClient({ clientId: 'synthetic-client' });
    const wallet = robinhoodWallet(configuration);
    return {
      provider: wallet.getProvider(), wallet,
      connect: () => wallet.connect({ client }),
      restore: async () => { try { await wallet.autoConnect({ client }); return true; } catch { return false; } },
      addresses: async () => wallet.getAccount() ? [wallet.getAccount().address] : [],
      chain: async () => wallet.getChain()?.id,
      switchChain: (id) => wallet.switchChain({ id }),
      cancel: () => wallet.cancelConnect(), disconnect: () => wallet.disconnect(), destroy: () => wallet.destroy(),
    };
  }
  if (platform === 'dynamic') {
    const { robinhoodWalletConnectors } = await import('@vexi/robinhood-wallet-dynamic');
    const [Constructor] = robinhoodWalletConnectors(configuration)();
    const connector = new Constructor({
      walletBook: { wallets: {}, groups: {} },
      evmNetworks: [1, 10].map((id) => ({ chainId: id, networkId: id, name: `Synthetic ${id}`, vanityName: `Synthetic ${id}`, iconUrls: [], blockExplorerUrls: [], rpcUrls: ['https://rpc.example.test'], nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } })),
      walletUiUtils: {},
    });
    return {
      provider: connector.provider, connector,
      connect: () => connector.connect(), restore: async () => (await connector.getConnectedAccounts()).length > 0,
      addresses: async () => connector.getWalletClient() ? connector.getWalletClient().getAddresses() : [],
      chain: () => connector.getNetwork(), switchChain: (id) => connector.switchNetwork({ networkChainId: id }),
      cancel: () => connector.cancelConnect(), disconnect: () => connector.endSession(), destroy: () => connector.destroy(),
    };
  }
  const { RobinhoodProvider } = await import('@vexi/robinhood-wallet');
  if (platform === 'privy') await import('@vexi/robinhood-wallet-privy');
  const provider = new RobinhoodProvider(configuration);
  return {
    provider, connect: () => provider.connect(), restore: () => provider.isAuthorized(),
    addresses: () => provider.getAccounts(), chain: () => provider.getChainId(),
    switchChain: (id) => provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${id.toString(16)}` }] }),
    cancel: () => provider.cancel(), disconnect: () => provider.disconnect(), destroy: () => provider.destroy(),
  };
}

test('packed adapter constructs without a browser, transport, or permission request', async () => {
  delete globalThis.window; delete globalThis.localStorage;
  const connection = await createConnection();
  try {
    assert.equal(connection.provider.status, 'idle');
    assert.equal(connection.provider.transport, undefined);
    assert.deepEqual(await connection.addresses(), []);
    assert.equal(await connection.restore(), false);
  } finally { connection.destroy(); }
});

test('packed connection follows account and chain events across disconnect and reconnect', async () => {
  const injected = installWallet();
  const connection = await createConnection();
  try {
    await connection.connect();
    assert.deepEqual(await connection.addresses(), [account]);
    assert.equal(injected.prompts, 1);
    injected.accounts = [otherAccount]; injected.emit('accountsChanged', injected.accounts);
    assert.deepEqual(await connection.addresses(), [otherAccount]);
    await connection.switchChain(10);
    assert.equal(await connection.chain(), 10);
    await connection.disconnect();
    assertClean(injected);
    assert.deepEqual(await connection.addresses(), []);
    await connection.connect();
    await connection.switchChain(1);
    assert.equal(await connection.chain(), 1);
    assert.equal(injected.listenerCount('accountsChanged'), 1);
    injected.accounts = []; injected.emit('accountsChanged', []);
    await pause();
    assert.deepEqual(await connection.addresses(), []);
    assertClean(injected);
    assert.equal(injected.signatures, 0);
  } finally { connection.destroy(); }
});

for (const action of ['cancel', 'disconnect']) test(`${action} ignores late approval and allows an explicit retry`, async () => {
  const injected = installWallet();
  let approve;
  injected.pendingApproval = new Promise((resolve) => { approve = resolve; });
  const connection = await createConnection();
  try {
    const rejected = assert.rejects(connection.connect());
    await until(() => injected.prompts === 1);
    await connection[action](); await rejected;
    approve(); await pause();
    assert.deepEqual(await connection.addresses(), []);
    assert.equal(connection.provider.connected, false);
    assertClean(injected);
    injected.pendingApproval = undefined;
    await connection.connect();
    assert.equal(injected.prompts, 2);
    await connection.disconnect();
  } finally { approve(); connection.destroy(); }
});

test('a rejected permission request is not retried automatically', async () => {
  const injected = installWallet();
  injected.rejection = Object.assign(new Error('Request cancelled'), { code: 4001 });
  const connection = await createConnection();
  try {
    await assert.rejects(connection.connect()); await pause();
    assert.equal(injected.prompts, 1); assertClean(injected);
    injected.rejection = undefined;
    await connection.connect(); await connection.disconnect();
    assert.equal(injected.prompts, 2);
  } finally { connection.destroy(); }
});

test('destroy preserves approved recovery; disconnect clears it without new permission requests', async () => {
  const injected = installWallet();
  const first = await createConnection(); await first.connect(); first.destroy(); assertClean(injected);
  const second = await createConnection();
  assert.equal(await second.restore(), true);
  assert.deepEqual(await second.addresses(), [account]); assert.equal(injected.prompts, 1);
  await second.disconnect(); second.destroy();
  const third = await createConnection();
  assert.equal(await third.restore(), false); third.destroy(); assertClean(injected);
});

if (platform === 'dynamic') test('logout lets an adopted recovery settle before clearing the session', async () => {
  const injected = installWallet();
  const first = await createConnection(); await first.connect(); first.destroy();
  const connection = await createConnection();
  const restore = connection.provider.isAuthorized.bind(connection.provider);
  let finish;
  const adopted = new Promise((resolve) => { finish = resolve; });
  connection.provider.isAuthorized = async () => {
    const authorized = await restore();
    await adopted;
    return authorized;
  };
  try {
    const connecting = connection.connect();
    // Observe a rejection immediately so the old behavior fails this test cleanly.
    const outcome = connecting.then(() => undefined, (error) => error);
    await until(() => connection.provider.connected);
    const disconnecting = connection.disconnect();
    finish();
    await disconnecting;
    assert.equal(await outcome, undefined, 'An already-approved recovery must not reject on logout');
    assert.equal(connection.provider.connected, false);
    assert.deepEqual(await connection.addresses(), []);
    assert.equal(injected.prompts, 1);
    assertClean(injected);
    assert.equal(await connection.restore(), false);
  } finally { finish(); connection.destroy(); }
});

test('an arbitrary injected provider is never relabeled as Robinhood', async () => {
  const injected = installWallet(); injected.isRobinhoodMobileWallet = false;
  const connection = await createConnection({ projectId: '' });
  try { await assert.rejects(connection.connect()); assert.equal(injected.prompts, 0); }
  finally { connection.destroy(); }
});

if (platform !== 'vanilla') test('actual React host imports and renders without browser permission requests', async () => {
  delete globalThis.window; delete globalThis.localStorage;
  const React = await import('react');
  const { renderToString } = await import('react-dom/server');
  let Host, props;
  if (platform === 'thirdweb') {
    ({ ThirdwebProvider: Host } = await import('thirdweb/react')); props = {};
  } else if (platform === 'dynamic') {
    ({ DynamicContextProvider: Host } = await import('@dynamic-labs/sdk-react-core'));
    const { createSettings } = await import('./src/config.ts');
    props = { settings: createSettings('00000000-0000-4000-8000-000000000000', options) };
  } else {
    ({ PrivyProvider: Host } = await import('@privy-io/react-auth'));
    props = { appId: 'c000000000000000000000000' };
  }
  assert.match(renderToString(React.createElement(Host, props, React.createElement('div', null, 'Synthetic host'))), /Synthetic host/);
});

if (platform === 'thirdweb') test('cancelling during core adoption clears the partially connected session', async () => {
  const injected = installWallet();
  const connection = await createConnection();
  const cancel = () => connection.cancel();
  connection.provider.on('connect', cancel);
  try {
    await assert.rejects(connection.connect(), { code: 4001 });
    assert.equal(connection.provider.connected, false);
    assert.deepEqual(await connection.addresses(), []);
    assertClean(injected);
    connection.provider.removeListener('connect', cancel);
    await connection.connect(); await connection.disconnect();
  } finally { connection.destroy(); }
});

if (platform === 'privy') {
  async function loginFixture() {
    const injected = installWallet();
    const connection = await createConnection();
    const { createRobinhoodPrivyLogin } = await import('@vexi/robinhood-wallet-privy');
    const calls = { generate: 0, login: 0, logout: 0 };
    const handlers = {
      async generateSiweMessage({ address, chainId }) { ++calls.generate; assert.equal(address, account); assert.equal(chainId, 'eip155:1'); return 'Synthetic sign-in message'; },
      async loginWithSiwe({ connectorType, walletClientType }) { ++calls.login; assert.equal(connectorType, 'injected'); assert.equal(walletClientType, 'robinhood'); return { id: 'synthetic-user' }; },
      async logout() { ++calls.logout; },
    };
    const controller = createRobinhoodPrivyLogin(connection.provider, handlers);
    return { injected, connection, calls, handlers, controller, cleanup() { controller.destroy(); connection.destroy(); } };
  }
  test('headless login requires an existing connection and a separate explicit sign-in action', async () => {
    const f = await loginFixture();
    try {
      await assert.rejects(f.controller.login(), { code: 4900 });
      assert.equal(f.injected.prompts, 0); assert.equal(f.calls.generate, 0);
      await f.connection.connect(); assert.equal(f.injected.signatures, 0);
      assert.equal((await f.controller.login()).id, 'synthetic-user');
      assert.deepEqual(f.calls, { generate: 1, login: 1, logout: 0 });
      assert.equal(f.injected.signatures, 1);
    } finally { f.cleanup(); }
  });
  for (const change of ['cancel', 'account', 'chain', 'disconnect']) test(`headless login stops stale ${change} completion before signature submission`, async () => {
    const f = await loginFixture(); let finish;
    try {
      await f.connection.connect();
      f.injected.pendingSignature = new Promise((resolve) => { finish = resolve; });
      const rejected = assert.rejects(f.controller.login());
      await until(() => f.injected.signatures === 1);
      await assert.rejects(f.controller.login(), { code: -32002 });
      if (change === 'cancel') f.controller.cancel();
      if (change === 'account') { f.injected.accounts = [otherAccount]; f.injected.emit('accountsChanged', f.injected.accounts); }
      if (change === 'chain') await f.connection.switchChain(10);
      if (change === 'disconnect') await f.connection.disconnect();
      finish(); await rejected; assert.equal(f.calls.login, 0);
    } finally { finish?.(); f.cleanup(); }
  });
  test('late authenticated completion is signed out after cancellation', async () => {
    const f = await loginFixture(); let finish;
    try {
      await f.connection.connect();
      f.handlers.loginWithSiwe = async () => { ++f.calls.login; await new Promise((resolve) => { finish = resolve; }); return { id: 'synthetic-user' }; };
      const rejected = assert.rejects(f.controller.login(), { code: 4001 });
      await until(() => f.calls.login === 1); f.controller.cancel(); finish(); await rejected;
      assert.equal(f.calls.logout, 1);
    } finally { finish?.(); f.cleanup(); }
  });
  test('signature rejection does not submit login and a deliberate retry succeeds', async () => {
    const f = await loginFixture();
    try {
      await f.connection.connect(); f.injected.rejection = Object.assign(new Error('Synthetic refusal'), { code: 4001 });
      await assert.rejects(f.controller.login()); assert.equal(f.calls.login, 0);
      f.injected.rejection = undefined; await f.controller.login(); assert.equal(f.calls.login, 1);
    } finally { f.cleanup(); }
  });
  test('destroy removes login listeners immediately while message generation is pending', async () => {
    const f = await loginFixture(); let finish;
    const listeners = new Set();
    const on = f.connection.provider.on.bind(f.connection.provider);
    const remove = f.connection.provider.removeListener.bind(f.connection.provider);
    f.connection.provider.on = (event, listener) => { listeners.add(listener); return on(event, listener); };
    f.connection.provider.removeListener = (event, listener) => { listeners.delete(listener); return remove(event, listener); };
    try {
      await f.connection.connect();
      f.handlers.generateSiweMessage = async () => { ++f.calls.generate; await new Promise((resolve) => { finish = resolve; }); return 'Synthetic sign-in message'; };
      const rejected = assert.rejects(f.controller.login(), { code: 4001 });
      await until(() => f.calls.generate === 1);
      assert.equal(listeners.size, 1);
      f.controller.destroy(); assert.equal(listeners.size, 0);
      finish(); await rejected;
      assert.equal(f.injected.signatures, 0); assert.equal(f.calls.login, 0);
    } finally { finish?.(); f.cleanup(); }
  });
}
