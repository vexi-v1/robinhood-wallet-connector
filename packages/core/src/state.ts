import { ProviderRpcError } from './types.js';
import type { SessionStorage } from './types.js';

export function parseChainId(value: unknown): number {
  const chain = typeof value === 'number' ? value : typeof value === 'string' && /^(0x[\da-f]+|\d+)$/i.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(chain) || chain <= 0) throw new ProviderRpcError(-32602, 'Invalid EVM chain ID.');
  return chain;
}

export function parseAccounts(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((a) => typeof a !== 'string' || !/^0x[\da-f]{40}$/i.test(a))) {
    throw new ProviderRpcError(-32603, 'The wallet returned invalid accounts.');
  }
  return [...new Set(value as string[])];
}

export const hexChainId = (chain: number): string => `0x${chain.toString(16)}`;

/** Addresses compare without checksum case; selections compare exactly, in order. */
export const includesAccount = (accounts: readonly string[], account: string): boolean => accounts.some((entry) => entry.toLowerCase() === account.toLowerCase());
export const sameAccounts = (left: readonly string[], right: readonly string[]): boolean => left.length === right.length && left.every((account, index) => account === right[index]);

/** Stable namespace for this connector's persisted state; independent instances need distinct prefixes. */
export const storagePrefix = (options: {projectId: string; storagePrefix?: string}): string => options.storagePrefix ?? `vexi-robinhood-${options.projectId}`;

export function safeStorage(): SessionStorage {
  // Holds only values that persistent storage rejected, so another tab's removal is never masked.
  const memory = new Map<string, string>();
  return {
    getItem(key) {
      if (memory.has(key)) return memory.get(key)!;
      try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
    },
    setItem(key, value) {
      try {
        if (!globalThis.localStorage) throw new Error('Persistent storage is unavailable.');
        globalThis.localStorage.setItem(key, value);
        memory.delete(key);
      } catch { memory.set(key, value); /* Private browsing may disable persistent storage. */ }
    },
    removeItem(key) { memory.delete(key); try { globalThis.localStorage?.removeItem(key); } catch { /* Local state still clears. */ } },
  };
}

/** The deepest focused element, following open shadow roots. Safe without a browser. */
export function focusedElement(root: Document | undefined = globalThis.document): HTMLElement | undefined {
  let element: Element | null | undefined = root?.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element && typeof (element as HTMLElement).focus === 'function' ? element as HTMLElement : undefined;
}
