import { NextResponse } from "next/server";
import { X402_NETWORK, X402_PAY_TO, USDC_BASE_SEPOLIA, PRICE_SEARCH, PRICE_IMAGE } from "@/lib/env";

export const dynamic = "force-dynamic";

// Machine-readable service declaration for x402 tooling and bazaars.
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return NextResponse.json({
    x402Version: 2,
    service: { name: "almoneda", description: "Public-domain artworks with license proof, sold per call to agents.", docs: `${origin}/llms.txt`, openapi: `${origin}/openapi.json` },
    network: X402_NETWORK,
    asset: { address: USDC_BASE_SEPOLIA, symbol: "USDC", decimals: 6 },
    payTo: X402_PAY_TO,
    facilitator: "https://x402.org/facilitator",
    resources: [
      { url: `${origin}/v1/search`, method: "GET", price: PRICE_SEARCH, input: { q: "search text", n: "1-12" } },
      { url: `${origin}/v1/search/image`, method: "POST", price: PRICE_IMAGE, input: { image_url: "or image_base64", n: "1-12" } },
      { url: `${origin}/mcp`, method: "POST", type: "mcp", tools: ["search_artworks", "search_by_image", "get_status"] },
    ],
  });
}
