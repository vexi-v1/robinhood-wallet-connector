// Synthetic public configuration only. No live platform, account, token or authentication response.
const network = {
  chainId: 1, networkId: 1, name: 'Ethereum', vanityName: 'Ethereum',
  iconUrls: [], blockExplorerUrls: [], rpcUrls: ['https://rpc.example.test'],
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};
const dynamicSettings = {
  environmentName: 'sandbox',
  chains: [{ name: 'ETH', enabled: true, networks: [{ networkId: 1, chainName: 'ETH', enabled: true }] }],
  networks: [{ chainName: 'ETH', networks: [network] }],
  kyc: [], providers: [], exchanges: [],
  design: {}, general: { displayName: 'Synthetic integration' }, privacy: {}, security: {},
  sdk: { multiWallet: false, automaticEmbeddedWalletCreation: false, emailSignIn: { enabled: false }, socialSignIn: { providers: [] } },
};

export async function platformFixture(route, platform) {
  const url = new URL(route.request().url());
  if (platform !== 'dynamic') return false;
  const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.hostname === 'dynamic-static-assets.com' && url.pathname.endsWith('/wallet-book.json')) {
    await json({ groups: {}, wallets: { synthetic: { name: 'Synthetic Wallet', shortName: 'Synthetic' } } });
  } else if (url.hostname === 'app.dynamicauth.com' && url.pathname.endsWith('/settings')) {
    await json(dynamicSettings);
  } else if (url.hostname === 'app.dynamicauth.com' && url.pathname.endsWith('/nonces')) {
    await json({ nonces: [] });
  } else if (url.hostname === 'logs.dynamicauth.com' || (url.hostname === 'app.dynamicauth.com' && url.pathname.endsWith('/sdkSettings'))) {
    await route.fulfill({ status: 204, body: '' });
  } else if (url.hostname === 'iconic.dynamic-static-assets.com') {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
  } else return false;
  return true;
}
