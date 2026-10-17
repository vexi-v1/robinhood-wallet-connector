import { ROBINHOOD_WALLET } from './metadata.js';
import type { EIP1193Provider } from './types.js';

export function isProvider(value: unknown): value is EIP1193Provider {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<EIP1193Provider>;
  return typeof p.request === 'function' && typeof p.on === 'function' && typeof p.removeListener === 'function';
}

/** Only published Robinhood identity hints select a provider. Hints are not vendor authentication. */
export async function discoverRobinhood(signal: AbortSignal, timeoutMs = 200): Promise<EIP1193Provider | undefined> {
  if (typeof window === 'undefined' || signal.aborted) return;
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (provider?: EIP1193Provider) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener('eip6963:announceProvider', announce);
      signal.removeEventListener('abort', abort);
      resolve(provider);
    };
    const abort = () => finish();
    const announce = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.info?.rdns === ROBINHOOD_WALLET.rdns && isProvider(detail.provider)) finish(detail.provider);
    };
    window.addEventListener('eip6963:announceProvider', announce);
    signal.addEventListener('abort', abort, {once: true});
    timer = setTimeout(() => {
      const ethereum = (window as unknown as {ethereum?: {providers?: unknown[]} & Record<string, unknown>}).ethereum;
      const candidates: unknown[] = [...(Array.isArray(ethereum?.providers) ? ethereum.providers : []), ethereum];
      finish(candidates.find((p) => isProvider(p) && (p as unknown as Record<string, unknown>).isRobinhoodMobileWallet === true) as EIP1193Provider | undefined);
    }, timeoutMs);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
  });
}
