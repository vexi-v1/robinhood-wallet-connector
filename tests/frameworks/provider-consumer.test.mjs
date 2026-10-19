import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const isEthers = Boolean(manifest.dependencies.ethers);
const account = '0x0000000000000000000000000000000000000001';
const otherAccount = '0x0000000000000000000000000000000000000002';
const options = {
  projectId: '00000000000000000000000000000000', chains: [1, 10], showModal: false, discoveryTimeoutMs: 1,
  metadata: { name: 'Synthetic consumer', description: 'No real wallet or funds', url: 'https://example.test', icons: [] },
};

class SyntheticWallet extends EventEmitter {
  isRobinhoodMobileWallet = true;
  accounts = [];
  chainId = 1;
  prompts = 0;
  pendingApproval;
  rejection;
  async request({ method, params }) {
    if (method === 'eth_accounts') return [...this.accounts];
    if (method === 'eth_chainId') return `0x${this.chainId.toString(16)}`;
    if (method === 'eth_requestAccounts') {
      this.prompts++;
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
    throw Object.assign(new Error('Unexpected request in synthetic consumer'), { code: 4200 });
  }
}

function installWallet() {
  const wallet = new SyntheticWallet();
  const window = new EventTarget();
  window.ethereum = wallet;
  globalThis.window = window;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  return wallet;
}

async function createConnection() {
  const { createWalletConnection } = await import('./src/client.ts');
  return createWalletConnection(options);
}
const requestAccounts = ({ client }) => isEthers
  ? client.send('eth_requestAccounts', []) : client.requestAddresses();
const getAccounts = async ({ client }) => isEthers
  ? (await client.listAccounts()).map((signer) => signer.address) : client.getAddresses();

test('packed SDK and actual client construct without a browser or account request', async () => {
  delete globalThis.window;
  delete globalThis.localStorage;
  const connection = await createConnection();
  try {
    assert.equal(connection.provider.status, 'idle');
    assert.equal(connection.provider.transport, undefined);
    assert.deepEqual(await getAccounts(connection), []);
    assert.equal(await connection.provider.isAuthorized(), false);
  } finally { connection.dispose(); }
});

test('actual client reads connected state, follows accounts and chains, and releases event listeners', async () => {
  const wallet = installWallet();
  const connection = await createConnection();
  const { provider, client } = connection;
  try {
    assert.equal(wallet.prompts, 0);
    assert.deepEqual(await requestAccounts(connection), [account]);
    assert.equal(wallet.prompts, 1);
    assert.deepEqual(await connection.readState(), { count: 1, chainId: 1 });
    if (isEthers) assert.equal(await (await client.getSigner()).getAddress(), account);
    wallet.accounts = [otherAccount];
    wallet.emit('accountsChanged', wallet.accounts);
    assert.deepEqual(await getAccounts(connection), [otherAccount]);
    if (isEthers) await client.send('wallet_switchEthereumChain', [{ chainId: '0xa' }]);
    else await client.switchChain({ id: 10 });
    assert.deepEqual(await connection.readState(), { count: 1, chainId: 10 });
    assert.equal(wallet.listenerCount('accountsChanged'), 1);
    wallet.accounts = [];
    wallet.emit('accountsChanged', []);
    assert.equal(provider.connected, false);
    assert.deepEqual(await getAccounts(connection), []);
    assert.equal(wallet.listenerCount('accountsChanged'), 0);
    await requestAccounts(connection);
    await provider.disconnect();
    assert.deepEqual(await getAccounts(connection), []);
    for (const event of ['accountsChanged', 'chainChanged', 'disconnect', 'message']) assert.equal(wallet.listenerCount(event), 0);
  } finally { connection.dispose(); }
});

test('cancellation rejects the client, ignores late approval, and permits a new explicit attempt', async () => {
  const wallet = installWallet();
  let approve;
  wallet.pendingApproval = new Promise((resolve) => { approve = resolve; });
  const connection = await createConnection();
  try {
    const rejected = assert.rejects(requestAccounts(connection), /cancel|reject/i);
    for (let attempt = 0; !wallet.prompts && attempt < 100; attempt++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(wallet.prompts, 1);
    connection.provider.cancel();
    await rejected;
    approve();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(await getAccounts(connection), []);
    assert.equal(wallet.prompts, 1);
    wallet.pendingApproval = undefined;
    assert.deepEqual(await requestAccounts(connection), [account]);
    assert.equal(wallet.prompts, 2);
    await connection.provider.disconnect();
  } finally { approve(); connection.dispose(); }
});

test('wallet rejection does not automatically repeat a permission request', async () => {
  const wallet = installWallet();
  wallet.rejection = Object.assign(new Error('Synthetic rejection'), { code: 4001 });
  const connection = await createConnection();
  try {
    await assert.rejects(requestAccounts(connection));
    assert.equal(wallet.prompts, 1);
    assert.equal(connection.provider.status, 'idle');
    wallet.rejection = undefined;
    await requestAccounts(connection);
    assert.equal(wallet.prompts, 2);
    await connection.provider.disconnect();
  } finally { connection.dispose(); }
});

test('new clients recover saved approval without prompting, while disconnect clears recovery', async () => {
  const wallet = installWallet();
  const first = await createConnection();
  await requestAccounts(first);
  first.dispose();
  assert.equal(wallet.listenerCount('accountsChanged'), 0);
  const restored = await createConnection();
  try {
    assert.deepEqual(await getAccounts(restored), []);
    assert.equal(await restored.provider.isAuthorized(), true);
    assert.deepEqual(await getAccounts(restored), [account]);
    assert.equal(wallet.prompts, 1);
    assert.equal(wallet.listenerCount('accountsChanged'), 1);
    await restored.provider.disconnect();
  } finally { restored.dispose(); }
  const loggedOut = await createConnection();
  try {
    assert.equal(await loggedOut.provider.isAuthorized(), false);
    assert.equal(wallet.prompts, 1);
    assert.equal(wallet.listenerCount('accountsChanged'), 0);
  } finally { loggedOut.dispose(); }
});
