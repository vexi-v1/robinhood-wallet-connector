export interface RequestArguments {
  readonly method: string;
  readonly params?: readonly unknown[] | object;
}

export type ProviderListener = (...args: any[]) => void;

export interface EIP1193Provider {
  request<T = unknown>(args: RequestArguments): Promise<T>;
  on(event: string, listener: ProviderListener): unknown;
  removeListener(event: string, listener: ProviderListener): unknown;
}

export interface ProviderMetadata {
  name: string;
  description: string;
  url: string;
  icons: string[];
}

export interface ConnectionResult {
  accounts: string[];
  chainId: number;
}

export interface ConnectionModal {
  open(callbacks: {onCancel: () => void; onRetry?: () => void; returnFocus?: HTMLElement}): void;
  ready(uri: string): Promise<void>;
  fail(message: string): void;
  close(): void;
}

export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RobinhoodProviderOptions {
  projectId: string;
  chains: readonly number[];
  optionalChains?: readonly number[];
  rpcMap?: Readonly<Record<number, string>>;
  metadata: ProviderMetadata;
  showModal?: boolean;
  connectTimeoutMs?: number;
  discoveryTimeoutMs?: number;
  /** Separate independent connector instances in the same origin. */
  storagePrefix?: string;
}

/** Transport seam for deterministic tests and custom hosts; no wallet is simulated by default. */
export interface RemoteTransport extends EIP1193Provider {
  connect(options: {chainId?: number; signal: AbortSignal; onUri: (uri: string) => void}): Promise<ConnectionResult>;
  restore(): Promise<ConnectionResult | undefined>;
  disconnect(): Promise<void>;
  destroy(): void;
}

/** Internal dependency injection used by the repository's adversarial tests. */
export interface ProviderDependencies {
  discover?: (signal: AbortSignal) => Promise<EIP1193Provider | undefined>;
  remote?: () => Promise<RemoteTransport>;
  modal?: () => Promise<ConnectionModal>;
  storage?: SessionStorage;
}

export class ProviderRpcError extends Error {
  constructor(public readonly code: number, message: string, public readonly data?: unknown) {
    super(message);
    this.name = 'ProviderRpcError';
  }
}
