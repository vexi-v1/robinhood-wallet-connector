import {RobinhoodProvider, ROBINHOOD_WALLET} from '@vexi/robinhood-wallet';
const projectId = import.meta.env.VITE_WC_PROJECT_ID?.trim() ?? '';
const provider = new RobinhoodProvider({projectId, chains: [1], rpcMap: {1: 'https://ethereum-rpc.publicnode.com'}, metadata: {name: 'Robinhood Wallet connector example', description: 'Community connector example', url: window.location.origin, icons: []}});
const connect = document.querySelector<HTMLButtonElement>('#connect')!;
const disconnect = document.querySelector<HTMLButtonElement>('#disconnect')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
document.querySelector<HTMLImageElement>('#icon')!.src = ROBINHOOD_WALLET.iconUrl;
if (!projectId) status.textContent = 'Set VITE_WC_PROJECT_ID in .env.local to enable remote pairing.';
connect.onclick = async () => {
  const connecting = provider.connect();
  connect.disabled = true; status.textContent = 'Waiting for your wallet…';
  try {const result = await connecting; status.textContent = `Connected on chain ${result.chainId}`; connect.hidden = true; disconnect.hidden = false;}
  catch (error) {status.textContent = (error as {code?: number}).code === 4001 ? 'Connection cancelled. You can try again.' : 'Could not connect. Check your project configuration and retry.';}
  finally {connect.disabled = false;}
};
disconnect.onclick = async () => {try {await provider.disconnect();} finally {status.textContent = 'Disconnected'; connect.hidden = false; disconnect.hidden = true;}};
window.addEventListener('pagehide', () => provider.destroy());
