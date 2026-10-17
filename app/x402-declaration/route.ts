import { NextResponse } from "next/server";
import { X402_NETWORK, X402_PAY_TO, USDC_BASE_SEPOLIA, X402_NETWORK_STELLAR, X402_PAY_TO_STELLAR, XLM_NATIVE_SAC, PRICE_SEARCH, PRICE_IMAGE, PRICE_SEARCH_XLM, PRICE_IMAGE_XLM } from "@/lib/env";

export const dynamic = "force-dynamic";

// Machine-readable service declaration for x402 tooling and bazaars.
// Every paid resource accepts both rails; Base Sepolia USDC is primary and
// Stellar testnet XLM (via its native SAC) is the secondary, faucet-friendly rail.
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const accepts = (usdPrice: string, xlm: { asset: string; amount: string }) => [
    { network: X402_NETWORK, asset: { address: USDC_BASE_SEPOLIA, symbol: "USDC", decimals: 6 }, payTo: X402_PAY_TO, price: usdPrice, primary: true },
    { network: X402_NETWORK_STELLAR, asset: { address: xlm.asset, symbol: "XLM", decimals: 7 }, payTo: X402_PAY_TO_STELLAR, price: { amount: xlm.amount }, primary: false },
  ];
  return NextResponse.json({
    x402Version: 2,
    service: { name: "almoneda", description: "Public-domain artworks with license proof, sold per call to agents.", docs: `${origin}/llms.txt`, openapi: `${origin}/openapi.json` },
    facilitator: "https://x402.org/facilitator",
    resources: [
      { url: `${origin}/v1/search`, method: "GET", accepts: accepts(PRICE_SEARCH, PRICE_SEARCH_XLM), input: { q: "search text", n: "1-12", strict: "1 to suppress low-relevance results (uncharged 404)" } },
      { url: `${origin}/v1/search/image`, method: "POST", accepts: accepts(PRICE_IMAGE, PRICE_IMAGE_XLM), input: { image_url: "or image_base64", n: "1-12" } },
      { url: `${origin}/mcp`, method: "POST", type: "mcp", accepts: accepts(PRICE_SEARCH, PRICE_SEARCH_XLM), tools: ["search_artworks", "search_by_image", "get_status"] },
    ],
  });
}
