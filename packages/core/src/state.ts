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

export function safeStorage(): SessionStorage {
  const memory = new Map<string, string>();
  return {
    getItem(key) { try { return globalThis.localStorage?.getItem(key) ?? memory.get(key) ?? null; } catch { return memory.get(key) ?? null; } },
    setItem(key, value) { memory.set(key, value); try { globalThis.localStorage?.setItem(key, value); } catch { /* Private browsing may disable persistent storage. */ } },
    removeItem(key) { memory.delete(key); try { globalThis.localStorage?.removeItem(key); } catch { /* Local state still clears. */ } },
  };
}
