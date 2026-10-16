import type { ProviderListener } from './types.js';

export class ProviderEmitter {
  private listeners = new Map<string, Set<ProviderListener>>();
  on(event: string, listener: ProviderListener): this {
    let listeners = this.listeners.get(event);
    if (!listeners) this.listeners.set(event, (listeners = new Set()));
    listeners.add(listener);
    return this;
  }
  once(event: string, listener: ProviderListener): this {
    const once: ProviderListener = (...args) => {
      this.removeListener(event, once);
      listener(...args);
    };
    return this.on(event, once);
  }
  removeListener(event: string, listener: ProviderListener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }
  off(event: string, listener: ProviderListener): this { return this.removeListener(event, listener); }
  protected emit(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      // Consumer callbacks cannot leave a connection promise or cleanup half finished.
      try { listener(...args); } catch { /* The consumer owns errors thrown by its listeners. */ }
    }
  }
  protected clearListeners(): void { this.listeners.clear(); }
}
