/**
 * AssetRegistry: Tracks tradable assets (Native, ERC20, etc.)
 */
export interface AssetMetadata {
    symbol: string;
    name: string;
    address?: string; // Empty for Native
    decimals: number;
    chainId: number;
    type: 'NATIVE' | 'ERC20' | 'ERC721' | 'ERC1155';
}

export class AssetRegistry {
    private assets: Map<string, AssetMetadata> = new Map();

    public register(asset: AssetMetadata) {
        const key = `${asset.symbol}:${asset.chainId}`;
        this.assets.set(key, asset);
        console.log(`[WEB3] Registered asset: ${asset.symbol} on chain ${asset.chainId}`);
    }

    public get(symbol: string, chainId: number): AssetMetadata | undefined {
        return this.assets.get(`${symbol}:${chainId}`);
    }

    public getAllOnChain(chainId: number): AssetMetadata[] {
        return Array.from(this.assets.values()).filter(a => a.chainId === chainId);
    }
}
