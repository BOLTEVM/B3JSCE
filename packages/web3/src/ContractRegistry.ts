/**
 * ContractRegistry: A centralized mapping for smart contract ABIs and Addresses.
 * Supports Ethereum and EVM-compatible chains.
 */
export interface ContractMetadata {
    name: string;
    address: string;
    abi: any[];
    chainId: number;
}

export class ContractRegistry {
    private contracts: Map<string, ContractMetadata> = new Map();

    /**
     * Register a contract for use in the B3JS Logic System.
     */
    public register(metadata: ContractMetadata) {
        this.contracts.set(metadata.name, metadata);
        console.log(`[WEB3] Registered contract: ${metadata.name} at ${metadata.address} (Chain: ${metadata.chainId})`);
    }

    /**
     * Retrieve contract metadata by its registered name.
     */
    public get(name: string): ContractMetadata | undefined {
        return this.contracts.get(name);
    }

    /**
     * Export all registered contracts (useful for serialization).
     */
    public export(): ContractMetadata[] {
        return Array.from(this.contracts.values());
    }

    /**
     * Import a list of contracts.
     */
    public import(list: ContractMetadata[]) {
        list.forEach(c => this.register(c));
    }
}
