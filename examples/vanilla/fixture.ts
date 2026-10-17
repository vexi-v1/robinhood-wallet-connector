import {RobinhoodProvider, type RemoteTransport, type ConnectionResult} from '@vexi/robinhood-wallet';
const uri = `wc:${'0'.repeat(64)}@2?relay-protocol=irn&symKey=${'1'.repeat(64)}`;
let attempts = 0;
const remote: RemoteTransport = {
  async connect({signal, onUri}) {
    onUri(uri);
    return new Promise<ConnectionResult>((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('Synthetic cancellation'), {code: 4001})), {once: true}));
  },
  async restore() {return undefined;}, async disconnect() {}, destroy() {},
  async request() {throw new Error('Synthetic fixture has no wallet requests');}, on() {}, removeListener() {},
};
const provider = new RobinhoodProvider({projectId: 'synthetic-fixture', chains: [1], metadata: {name: 'Synthetic UI fixture', description: 'No real pairing', url: window.location.origin, icons: []}}, {discover: async () => undefined, remote: async () => remote});
const button = document.querySelector<HTMLButtonElement>('#connect')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
button.onclick = async () => {
  const connecting = provider.connect();
  attempts++; button.disabled = true; status.textContent = `Attempt ${attempts}: connecting`;
  try {await connecting; status.textContent = 'Unexpected connection';}
  catch {status.textContent = `Attempt ${attempts}: cancelled · provider ${provider.status}`;}
  finally {button.disabled = false;}
};
window.addEventListener('pagehide', () => provider.destroy());
