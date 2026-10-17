import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const isOnboard = Boolean(manifest.dependencies['@web3-onboard/core']);
const isRainbowKit = Boolean(manifest.dependencies['@rainbow-me/rainbowkit']);
const account = '0x0000000000000000000000000000000000000001';
const metadata = { name: 'Synthetic framework consumer', description: 'No real wallet or funds', url: 'https://example.test', icons: [] };
const projectId = '00000000000000000000000000000000';

class InjectedWallet extends EventEmitter {
  isRobinhoodMobileWallet = true;
  accounts = [];
  chainId = 1;
  prompts = 0;
  pendingApproval;
  switchError;
  async request({ method, params }) {
    if (method === 'eth_accounts') return [...this.accounts];
    if (method === 'eth_chainId') return `0x${this.chainId.toString(16)}`;
    if (method === 'eth_requestAccounts') {
      this.prompts++;
      if (this.pendingApproval) await this.pendingApproval;
      this.accounts = [account];
      return [...this.accounts];
    }
    if (method === 'wallet_switchEthereumChain') {
      if (this.switchError) throw this.switchError;
      this.chainId = Number(params[0].chainId);
      this.emit('chainChanged', `0x${this.chainId.toString(16)}`);
      return null;
    }
    if (method === 'wallet_revokePermissions') { this.accounts = []; return null; }
    throw Object.assign(new Error(`Synthetic wallet does not implement ${method}`), { code: 4200 });
  }
}

function installWallet(wallet = new InjectedWallet()) {
  const fakeWindow = new EventTarget();
  fakeWindow.ethereum = wallet;
  fakeWindow.location = { origin: 'https://example.test' };
  globalThis.window = fakeWindow;
  return wallet;
}

test('packed entrypoints import without a browser or prompting a wallet', async () => {
  delete globalThis.window;
  const { RobinhoodProvider } = await import('@vexi/robinhood-wallet');
  assert.equal(typeof RobinhoodProvider, 'function');
  if (isOnboard) assert.equal(typeof (await import('@vexi/robinhood-wallet-onboard')).robinhoodModule, 'function');
  else assert.equal(typeof (await import('@vexi/robinhood-wallet-wagmi')).robinhoodWallet, 'function');
});

if (!isOnboard) {
  test('actual wagmi actions connect, propagate events, switch, disconnect, and reconnect', async () => {
    const wallet = installWallet();
    const { createConfig, connect, disconnect, getAccount, http, switchChain } = await import('@wagmi/core');
    const { mainnet, optimism } = await import('viem/chains');
    const { robinhoodWallet } = await import('@vexi/robinhood-wallet-wagmi');
    const config = createConfig({ chains: [mainnet, optimism], connectors: [robinhoodWallet({ projectId, metadata, showModal: false, discoveryTimeoutMs: 1 })], transports: { 1: http(), 10: http() }, multiInjectedProviderDiscovery: false, storage: null });
    const connector = config.connectors[0];
    assert.equal(await connector.getChainId(), 1);
    assert.equal(wallet.prompts, 0);
    const result = await connect(config, { connector, withCapabilities: true });
    assert.equal(result.accounts[0].address, account);
    assert.equal(getAccount(config).status, 'connected');
    assert.equal(wallet.prompts, 1);
    await switchChain(config, { connector, chainId: 10 });
    assert.equal(getAccount(config).chainId, 10);
    await assert.rejects(connector.switchChain({ chainId: 999999 }));
    await disconnect(config, { connector });
    assert.equal(getAccount(config).status, 'disconnected');
    assert.equal(wallet.listenerCount('accountsChanged'), 0);
    await connect(config, { connector });
    assert.equal(getAccount(config).status, 'connected');
    assert.equal(wallet.listenerCount('accountsChanged'), 1);
    wallet.accounts = [];
    wallet.emit('accountsChanged', []);
    assert.equal(getAccount(config).status, 'disconnected');
    await connector.disconnect();
  });

  test('cancelling an actual wagmi pending connect rejects and ignores late injected approval', async () => {
    const wallet = installWallet();
    let approve;
    wallet.pendingApproval = new Promise((resolve) => { approve = resolve; });
    const { createConfig, connect, getAccount, http } = await import('@wagmi/core');
    const { mainnet } = await import('viem/chains');
    const { robinhoodWallet } = await import('@vexi/robinhood-wallet-wagmi');
    const config = createConfig({ chains: [mainnet], connectors: [robinhoodWallet({ projectId, metadata, showModal: false, discoveryTimeoutMs: 1 })], transports: { 1: http() }, multiInjectedProviderDiscovery: false, storage: null });
    const connector = config.connectors[0];
    const pending = connect(config, { connector });
    const rejected = assert.rejects(pending, /cancel|reject/i);
    while (!wallet.prompts) await new Promise((resolve) => setTimeout(resolve, 2));
    connector.cancelConnect();
    await rejected;
    approve();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(getAccount(config).status, 'disconnected');
    assert.deepEqual(await connector.getAccounts(), []);
    wallet.pendingApproval = undefined;
    await connect(config, { connector });
    assert.equal(getAccount(config).status, 'connected');
    await connector.disconnect();
  });

  test('a requested chain is a preference: the in-app chain is reported, kept after a failed switch, and lost only on rejection', async () => {
    const wallet = installWallet();
    wallet.chainId = 10;
    const { createConfig, connect, disconnect, getAccount, http } = await import('@wagmi/core');
    const { mainnet, optimism } = await import('viem/chains');
    const { robinhoodWallet } = await import('@vexi/robinhood-wallet-wagmi');
    const config = createConfig({ chains: [mainnet, optimism], connectors: [robinhoodWallet({ projectId, metadata, showModal: false, discoveryTimeoutMs: 1 })], transports: { 1: http(), 10: http() }, multiInjectedProviderDiscovery: false, storage: null });
    const connector = config.connectors[0];
    // Like wagmi's injected connector, the chain reported before connecting is the wallet's own.
    assert.equal(await connector.getChainId(), 10);
    assert.equal(wallet.prompts, 0);
    wallet.switchError = Object.assign(new Error('Unrecognized chain ID'), { code: 4902 });
    assert.equal((await connect(config, { connector, chainId: 1 })).chainId, 10);
    assert.equal(getAccount(config).chainId, 10);
    await disconnect(config, { connector });
    wallet.switchError = Object.assign(new Error('User rejected the request.'), { code: 4001 });
    await assert.rejects(connect(config, { connector, chainId: 1 }), { name: 'UserRejectedRequestError' });
    assert.equal(getAccount(config).status, 'disconnected');
    assert.equal((await connector.getProvider()).status, 'idle');
  });

  test('a repeated wagmi connect shares the pending wallet prompt', async () => {
    const wallet = installWallet();
    let approve;
    wallet.pendingApproval = new Promise((resolve) => { approve = resolve; });
    const { createConfig, connect, getAccount, http } = await import('@wagmi/core');
    const { mainnet } = await import('viem/chains');
    const { robinhoodWallet } = await import('@vexi/robinhood-wallet-wagmi');
    const config = createConfig({ chains: [mainnet], connectors: [robinhoodWallet({ projectId, metadata, showModal: false, discoveryTimeoutMs: 1 })], transports: { 1: http() }, multiInjectedProviderDiscovery: false, storage: null });
    const connector = config.connectors[0];
    const first = connect(config, { connector });
    const second = connect(config, { connector });
    while (!wallet.prompts) await new Promise((resolve) => setTimeout(resolve, 2));
    approve();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.deepEqual(firstResult.accounts, secondResult.accounts);
    assert.equal(wallet.prompts, 1);
    assert.equal(getAccount(config).status, 'connected');
    await connector.disconnect();
  });
}

if (isRainbowKit) {
  test('RainbowKit SSR configuration initializes and checks authorization without window', async () => {
    delete globalThis.window;
    const { connectorsForWallets } = await import('@rainbow-me/rainbowkit');
    const { createConfig, http } = await import('wagmi');
    const { mainnet } = await import('wagmi/chains');
    const { robinhoodWallet } = await import('@vexi/robinhood-wallet-rainbowkit');
    for (const createWallet of [
      robinhoodWallet,
      () => robinhoodWallet({ projectId, appName: metadata.name, appDescription: metadata.description, appUrl: metadata.url }),
    ]) {
      const connectors = connectorsForWallets([{ groupName: 'Recommended', wallets: [createWallet] }], { projectId, appName: metadata.name, appDescription: metadata.description, appUrl: metadata.url });
      const config = createConfig({ chains: [mainnet], connectors, transports: { 1: http() }, ssr: true, multiInjectedProviderDiscovery: false, storage: null });
      const provider = await config.connectors[0].getProvider();
      assert.equal(provider.status, 'idle');
      assert.equal(await config.connectors[0].isAuthorized(), false);
      assert.deepEqual(await provider.getAccounts(), []);
      assert.equal(provider.transport, undefined);
      provider.destroy();
    }
    assert.equal(typeof globalThis.window, 'undefined');
  });

  test('actual RainbowKit creates the branded connector with its metadata and one UI owner', async () => {
    installWallet();
    const { connectorsForWallets } = await import('@rainbow-me/rainbowkit');
    const { createConfig, http } = await import('wagmi');
    const { mainnet } = await import('wagmi/chains');
    const { robinhoodWallet } = await import('@vexi/robinhood-wallet-rainbowkit');
    const wallet = robinhoodWallet({ projectId, appName: metadata.name });
    assert.equal(wallet.name, 'Robinhood Wallet');
    assert.equal(wallet.qrCode, undefined);
    assert.equal(wallet.mobile, undefined);
    const connectors = connectorsForWallets([{ groupName: 'Recommended', wallets: [robinhoodWallet] }], { projectId, appName: metadata.name, appUrl: metadata.url });
    const config = createConfig({ chains: [mainnet], connectors, transports: { 1: http() }, multiInjectedProviderDiscovery: false, storage: null });
    assert.equal(config.connectors[0].id, wallet.id);
    assert.equal(config.connectors[0].rkDetails.name, 'Robinhood Wallet');
    assert.equal(config.connectors[0].rkDetails.groupName, 'Recommended');
    assert.equal(config.connectors[0].rkDetails.isRainbowKitConnector, true);
    assert.equal(config.connectors[0].rkDetails.index, 0);
    await config.connectors[0].disconnect();
  });
}

if (isOnboard) {
  test('Onboard public module creates a lazy EIP-1193 interface and preserves disconnect', async () => {
    const wallet = installWallet();
    const { robinhoodModule } = await import('@vexi/robinhood-wallet-onboard');
    const module = robinhoodModule({ projectId, metadata, showModal: false, discoveryTimeoutMs: 1 })({ device: { type: null, os: null, browser: null } });
    assert.equal(module.label, 'Robinhood Wallet');
    const helpers = { chains: [{ id: '0x1', label: 'Ethereum', token: 'ETH', rpcUrl: 'https://example.test/rpc' }], appMetadata: null, EventEmitter };
    const { provider, instance } = await module.getInterface(helpers);
    assert.equal(wallet.prompts, 0);
    assert.equal(provider, instance);
    assert.equal((await module.getInterface(helpers)).provider, provider);
    assert.equal(await provider.request({ method: 'eth_chainId' }), '0x1');
    assert.deepEqual(await provider.request({ method: 'eth_requestAccounts' }), [account]);
    assert.equal(wallet.prompts, 1);
    assert.equal(await instance.isAuthorized(), true);
    await provider.disconnect();
    assert.equal(wallet.listenerCount('accountsChanged'), 0);
    assert.deepEqual(await provider.request({ method: 'eth_accounts' }), []);
  });

  test('a new Onboard module instance recovers the approved session without another prompt', async () => {
    const values = new Map();
    globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, String(value)); }, removeItem: (key) => { values.delete(key); } };
    try {
      const wallet = installWallet();
      const { robinhoodModule } = await import('@vexi/robinhood-wallet-onboard');
      const helpers = { chains: [{ id: '0x1', label: 'Ethereum', token: 'ETH', rpcUrl: 'https://example.test/rpc' }], appMetadata: null, EventEmitter };
      const create = () => robinhoodModule({ projectId, metadata, showModal: false, discoveryTimeoutMs: 1 })({ device: { type: null, os: null, browser: null } }).getInterface(helpers);
      const first = await create();
      assert.deepEqual(await first.provider.request({ method: 'eth_requestAccounts' }), [account]);
      first.instance.destroy();
      // Onboard reconnects through eth_requestAccounts; the approved session is recovered, not requested again.
      const second = await create();
      assert.deepEqual(await second.provider.request({ method: 'eth_requestAccounts' }), [account]);
      assert.equal(wallet.prompts, 1);
      await second.provider.disconnect();
      assert.equal(values.size, 0);
    } finally {
      delete globalThis.localStorage;
    }
  });

  test('actual Onboard core accepts the module and initializes without requesting accounts', async () => {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test', pretendToBeVisual: true });
    const names = ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'CustomEvent', 'Event', 'MutationObserver', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame', 'customElements', 'getComputedStyle', 'Node', 'DocumentFragment', 'SVGElement'];
    const prior = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
    dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
    const wallet = new InjectedWallet();
    dom.window.ethereum = wallet;
    try {
      const { default: Onboard } = await import('@web3-onboard/core');
      const { robinhoodModule } = await import('@vexi/robinhood-wallet-onboard');
      const onboard = Onboard({
        wallets: [robinhoodModule({ projectId, metadata, showModal: false, discoveryTimeoutMs: 1 })],
        chains: [{ id: '0x1', label: 'Ethereum', token: 'ETH', rpcUrl: 'https://example.test/rpc' }],
        appMetadata: { name: metadata.name, description: metadata.description, explore: metadata.url },
        accountCenter: { desktop: { enabled: false }, mobile: { enabled: false } },
      });
      assert.equal(typeof onboard.connectWallet, 'function');
      assert.equal(onboard.state.get().chains[0].id, '0x1');
      assert.deepEqual(onboard.state.get().wallets, []);
      assert.equal(wallet.prompts, 0);
    } finally {
      // Onboard's public API has no destroy operation. Keep its browser globals
      // alive until its lazy UI imports settle in this isolated test process.
      process.once('beforeExit', () => {
        dom.window.close();
        for (const [name, descriptor] of prior) {
          if (descriptor) Object.defineProperty(globalThis, name, descriptor);
          else delete globalThis[name];
        }
      });
    }
  });
}
