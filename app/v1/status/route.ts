import { NextResponse } from "next/server";
import { corpusSize } from "@/lib/corpus";
import { recentSales, salesCount } from "@/lib/ledger";
import { X402_NETWORK, X402_NETWORK_STELLAR, X402_PAY_TO, X402_PAY_TO_STELLAR, USDC_BASE_SEPOLIA, XLM_NATIVE_SAC, PRICE_SEARCH, PRICE_IMAGE } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  const [size, total, recent, fac] = await Promise.all([
    corpusSize(),
    salesCount(),
    recentSales(20),
    fetch("https://x402.org/facilitator/supported", { signal: AbortSignal.timeout(5000) })
      .then((r) => r.ok)
      .catch(() => false),
  ]);
  return NextResponse.json({
    service: "almoneda",
    status: size != null && fac ? "open" : "degraded",
    corpus: { size, sources: ["met", "cle", "aic", "nga"] },
    sales: { total, recent },
    payments: {
      protocol: "x402",
      version: 2,
      facilitator: "https://x402.org/facilitator",
      facilitator_reachable: fac,
      rails: [
        { scheme: "exact", network: X402_NETWORK, asset: { symbol: "USDC", contract: USDC_BASE_SEPOLIA }, pay_to: X402_PAY_TO, explorer: "https://sepolia.basescan.org" },
        { scheme: "exact", network: X402_NETWORK_STELLAR, asset: { symbol: "XLM", contract: XLM_NATIVE_SAC }, pay_to: X402_PAY_TO_STELLAR, explorer: "https://stellar.expert/explorer/testnet" },
      ],
      prices: { "GET /v1/search": PRICE_SEARCH, "POST /v1/search/image": PRICE_IMAGE, "mcp search_artworks": PRICE_SEARCH },
    },
    limits: { free_demo_per_ip_per_day: 5, max_results: 12, image_max_bytes: 8_000_000 },
  });
}
