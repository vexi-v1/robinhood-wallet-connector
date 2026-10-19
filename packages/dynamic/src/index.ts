import { EthereumWalletConnector, type EthereumWalletConnectorOpts } from '@dynamic-labs/ethereum-core';
import { createWalletClient, custom, defineChain, getAddress, type Account, type Chain, type Transport, type WalletClient } from 'viem';
import { RobinhoodProvider, ROBINHOOD_WALLET, type RobinhoodProviderOptions } from '@vexi/robinhood-wallet';

export interface RobinhoodDynamicConnector extends EthereumWalletConnector {
  readonly provider: RobinhoodProvider;
  cancelConnect(): void;
  destroy(): void;
}

/** Register the returned factory in DynamicContextProvider.settings.walletConnectors. */
export function robinhoodWalletConnectors(options: RobinhoodProviderOptions): () => Array<new (props: EthereumWalletConnectorOpts) => RobinhoodDynamicConnector> {
  class RobinhoodWalletConnector extends EthereumWalletConnector {
    override name = ROBINHOOD_WALLET.name;
    override overrideKey = 'robinhood';
    // Dynamic's custom SDK routing flag; Robinhood remains a self-custodial wallet.
    override canConnectViaCustodialService = true;
    override canHandleMultipleConnections = false;
    readonly provider = new RobinhoodProvider(options);
    private listening = false;
    private ready = false;

    constructor(props: EthereumWalletConnectorOpts) {
      super({ ...props, metadata: { id: 'robinhood', name: ROBINHOOD_WALLET.name, icon: ROBINHOOD_WALLET.iconUrl } });
    }
    override async init() {
      if (this.ready) return;
      this.ready = true;
      this.walletConnectorEventsEmitter.emit('providerReady', { connector: this });
    }
    override async connect() { await this.getAddress(); }
    override async getAddress() {
      const { accounts, chainId } = await this.provider.connect();
      this.currentChain = chainId;
      this.setActiveAccount(accounts[0] ? getAddress(accounts[0]) : undefined);
      this.setupEventListeners();
      return accounts[0];
    }
    override async getConnectedAccounts() {
      if (!await this.provider.isAuthorized()) return [];
      const accounts = await this.provider.getAccounts();
      this.currentChain = await this.provider.getChainId();
      this.setActiveAccount(accounts[0] ? getAddress(accounts[0]) : undefined);
      this.setupEventListeners();
      return accounts;
    }
    override async getNetwork() { return this.provider.connected ? this.provider.getChainId() : undefined; }
    override getWalletClient(chainId?: string): WalletClient<Transport, Chain, Account> | undefined {
      const account = this.getActiveAccount();
      if (!account || !this.provider.connected) return undefined;
      const network = this.evmNetworks.find((item) => String(item.chainId) === chainId)
        ?? this.evmNetworks.find((item) => item.chainId === this.currentChain);
      if (!network) return undefined;
      const chain = defineChain({
        id: network.chainId, name: network.name,
        nativeCurrency: network.nativeCurrency,
        rpcUrls: { default: { http: network.rpcUrls } },
      });
      return createWalletClient<Transport, Chain, Account>({ account, chain, transport: custom(this.provider, { retryCount: 0 }) });
    }
    private currentChain = options.chains[0];
    private accountsChanged = (accounts: string[]) => {
      this.setActiveAccount(accounts[0] ? getAddress(accounts[0]) : undefined);
      this.emit('accountChange', { accounts });
    };
    private chainChanged = (chain: string) => {
      this.currentChain = Number(chain);
      this.emit('chainChange', { chain: String(this.currentChain) });
    };
    private disconnected = () => {
      this.setActiveAccount(undefined);
      this.teardownEventListeners();
      this.emit('disconnect');
    };
    override setupEventListeners() {
      if (this.listening) return;
      this.listening = true;
      this.provider.on('accountsChanged', this.accountsChanged);
      this.provider.on('chainChanged', this.chainChanged);
      this.provider.on('disconnect', this.disconnected);
    }
    override teardownEventListeners() {
      this.provider.removeListener('accountsChanged', this.accountsChanged);
      this.provider.removeListener('chainChanged', this.chainChanged);
      this.provider.removeListener('disconnect', this.disconnected);
      this.listening = false;
      this.didSetup = false;
    }
    override async endSession() {
      try {
        // Dynamic can expose a restored wallet before its connection promise settles.
        // Finish that approved recovery before logout cancels pending connections.
        if (this.provider.connected) await this.provider.connect().catch(() => undefined);
        await this.provider.disconnect();
      }
      finally { this.setActiveAccount(undefined); this.teardownEventListeners(); }
    }
    override async signMessage(message: string) {
      const client = this.getWalletClient();
      if (!client) throw new Error('Connect Robinhood Wallet before signing.');
      return client.signMessage({ message });
    }
    override async proveOwnership(address: string, message: string) {
      if (getAddress(address) !== getAddress(this.getActiveAccount()?.address ?? '')) {
        throw new Error('The connected account changed.');
      }
      return this.signMessage(message);
    }
    cancelConnect() { this.provider.cancel(); }
    destroy() {
      this.teardownEventListeners();
      this.provider.destroy();
      this.setActiveAccount(undefined);
      this.removeAllListeners();
    }
  }
  return () => [RobinhoodWalletConnector];
}
