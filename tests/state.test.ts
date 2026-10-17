import test from 'node:test';
import assert from 'node:assert/strict';
import {safeStorage} from '../packages/core/src/state.js';

function withLocalStorage(value: unknown, run: () => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, get: () => { if (value instanceof Error) throw value; return value; }});
  try { run(); } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

function persistent(writes = true) {
  const values = new Map<string, string>();
  return {values, storage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { if (!writes) throw new Error('QuotaExceededError'); values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  }};
}

test('persistent storage stays authoritative, so a removal by another tab is not masked', () => {
  const {values, storage} = persistent();
  withLocalStorage(storage, () => {
    const selection = safeStorage();
    selection.setItem('marker', 'walletConnect');
    assert.equal(values.get('marker'), 'walletConnect');
    values.delete('marker');
    assert.equal(selection.getItem('marker'), null);
  });
});

test('rejected or unavailable persistent storage keeps this page usable from memory', () => {
  for (const local of [persistent(false).storage, new Error('SecurityError'), undefined]) {
    withLocalStorage(local, () => {
      const selection = safeStorage();
      selection.setItem('marker', 'injected');
      assert.equal(selection.getItem('marker'), 'injected');
      selection.removeItem('marker');
      assert.equal(selection.getItem('marker'), null);
    });
  }
});
