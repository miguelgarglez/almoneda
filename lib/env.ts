// Server-only environment. Values come from ~/.config/lab/secrets.env via
// .env.local (dev) and Vercel env vars (prod). None of these may reach the client.
export const env = {
  supabaseUrl: process.env.SUPABASE_LAB_URL!,
  supabaseAnon: process.env.SUPABASE_LAB_ANON_KEY!,
  supabaseService: process.env.SUPABASE_LAB_SERVICE_KEY!,
  buyerKey: process.env.X402_TEST_BUYER_KEY as `0x${string}` | undefined,
  buyerStellar: process.env.X402_TEST_BUYER_STELLAR as string | undefined,
};

export const X402_NETWORK = "eip155:84532"; // Base Sepolia
export const X402_PAY_TO = "0x0706dB1F1347d9ABe4CCDF76D839F4D533c56119"; // Miguel's receive-only wallet
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
// Second rail: Stellar testnet. Native XLM via its Soroban asset contract —
// friendbot funds buyers with no login, and the facilitator sponsors fees.
export const X402_NETWORK_STELLAR = "stellar:testnet";
export const X402_PAY_TO_STELLAR = "GCQUYYVGKZBF32ZHIU6SUOWR7VBOJXLHK52E3DBZMNXU4HBWATWDPLZD";
export const XLM_NATIVE_SAC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
export const PRICE_SEARCH = "$0.01";
export const PRICE_IMAGE = "$0.02";
// XLM flat prices in stroops (7 decimals): 0.01 XLM / 0.02 XLM.
export const PRICE_SEARCH_XLM = { asset: XLM_NATIVE_SAC, amount: "100000" } as const;
export const PRICE_IMAGE_XLM = { asset: XLM_NATIVE_SAC, amount: "200000" } as const;
export const EXPLORER = "https://sepolia.basescan.org/tx/";
export const EXPLORER_STELLAR = "https://stellar.expert/explorer/testnet/tx/";
