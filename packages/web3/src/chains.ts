export interface ChainConfig {
  name: string;
  id: string;
  rpc: string;
  explorer: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  derivationPath: string;
  color: string;
  logo: string;
}

export const CHAINS: Record<string, ChainConfig> = {
  ethereum: {
    name: "Ethereum",
    id: "1",
    rpc: "https://rpc.ankr.com/eth",
    explorer: "https://etherscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/",
    color: "#627EEA",
    logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png"
  },
  bsc: {
    name: "Binance Smart Chain",
    id: "56",
    rpc: "https://rpc.ankr.com/bsc",
    explorer: "https://bscscan.com",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/",
    color: "#F3BA2F",
    logo: "https://cryptologos.cc/logos/bnb-bnb-logo.png"
  },
  polygon: {
    name: "Polygon",
    id: "137",
    rpc: "https://rpc.ankr.com/polygon",
    explorer: "https://polygonscan.com",
    nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/",
    color: "#8247E5",
    logo: "https://cryptologos.cc/logos/polygon-matic-logo.png"
  },
  monad: {
    name: "Monad",
    id: "143",
    rpc: "https://rpc.ankr.com/monad",
    explorer: "https://monadvision.com",
    nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/",
    color: "#836EF9",
    logo: "https://pbs.twimg.com/profile_images/1701633519159930880/4747v35G_400x400.jpg"
  },
  quai: {
    name: "Quai Network",
    id: "969",
    rpc: "https://rpc.quai.network",
    explorer: "https://quaiscan.io",
    nativeCurrency: { name: "Quai", symbol: "QUAI", decimals: 18 },
    derivationPath: "m/44'/969'/0'/0/",
    color: "#ff3333",
    logo: "https://cryptologos.cc/logos/quai-logo.png"
  }
};
