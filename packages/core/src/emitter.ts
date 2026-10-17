import type { ProviderListener } from './types.js';

type OnceListener = ProviderListener & { listener?: ProviderListener };

/** Reports a consumer callback failure as EventTarget does, without interrupting provider state changes. */
function reportListenerError(error: unknown): void {
  const scope = globalThis as {reportError?: (error: unknown) => void};
  try { if (typeof scope.reportError === 'function') scope.reportError(error); } catch { /* Reporting is best effort. */ }
}

export class ProviderEmitter {
  private listeners = new Map<string, Set<ProviderListener>>();
  on(event: string, listener: ProviderListener): this {
    let listeners = this.listeners.get(event);
    if (!listeners) this.listeners.set(event, (listeners = new Set()));
    listeners.add(listener);
    return this;
  }
  once(event: string, listener: ProviderListener): this {
    const once: OnceListener = (...args) => {
      this.removeListener(event, once);
      listener(...args);
    };
    // Lets removeListener(event, listener) cancel a once registration, as Node's EventEmitter does.
    once.listener = listener;
    return this.on(event, once);
  }
  removeListener(event: string, listener: ProviderListener): this {
    const listeners = this.listeners.get(event);
    if (!listeners?.delete(listener)) {
      for (const registered of listeners ?? []) {
        if ((registered as OnceListener).listener === listener) { listeners!.delete(registered); break; }
      }
    }
    return this;
  }
  off(event: string, listener: ProviderListener): this { return this.removeListener(event, listener); }
  protected emit(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      // Consumer callbacks cannot leave a connection promise or cleanup half finished.
      try { listener(...args); } catch (error) { reportListenerError(error); }
    }
  }
  protected clearListeners(): void { this.listeners.clear(); }
}
