// x402 v2 resource server: exact-USDC on Base Sepolia via the public testnet
// facilitator. The facilitator verifies the buyer's EIP-3009 signature and
// broadcasts transferWithAuthorization itself — this server holds no keys.
import { x402ResourceServer } from "@x402/next";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { insertSale } from "./ledger";
import { X402_NETWORK, X402_NETWORK_STELLAR, X402_PAY_TO, X402_PAY_TO_STELLAR } from "./env";

// Handlers stash sale details keyed by the payment nonce; the afterSettle
// hook picks them up when it records the sale.
export type SaleCtx = { endpoint: string; query_hint: string; artwork_ids: string[]; latency_ms: number };
export const saleCtx = new Map<string, SaleCtx>();

export function paymentNonce(headerValue: string | null): string | null {
  if (!headerValue) return null;
  try {
    const p = JSON.parse(Buffer.from(headerValue, "base64").toString("utf8"));
    return p?.payload?.authorization?.nonce ?? p?.payload?.transaction ?? null;
  } catch {
    return null;
  }
}

export const x402Server = new x402ResourceServer(
  new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" })
)
  .register(X402_NETWORK, new ExactEvmScheme())
  .register(X402_NETWORK_STELLAR, new ExactStellarScheme())
  .onAfterSettle(async (ctx) => {
    try {
      if (ctx.phase !== "after-handler" || !ctx.result?.success) return;
      // manual settlePayment calls (the MCP route) record their own sale with
      // full context; only HTTP-route settles land here via withX402
      if (!ctx.transportContext) return;
      const nonce = (ctx.paymentPayload as any)?.payload?.authorization?.nonce ?? (ctx.paymentPayload as any)?.payload?.transaction ?? "";
      const extra = nonce ? saleCtx.get(nonce) : undefined;
      if (nonce) saleCtx.delete(nonce);
      const payer = ctx.result.payer ?? (ctx.paymentPayload as any)?.payload?.authorization?.from ?? "";
      const path = (ctx.transportContext as any)?.request?.adapter?.getPath?.() ?? "";
      await insertSale({
        payer,
        tx: ctx.result.transaction ?? "",
        network: ctx.result.network ?? X402_NETWORK,
        amount: String(ctx.requirements?.amount ?? ""),
        endpoint: extra?.endpoint ?? (path.includes("/mcp") ? "mcp" : path.includes("/image") ? "image" : "text"),
        query_hint: extra?.query_hint ?? "",
        artwork_ids: extra?.artwork_ids ?? [],
        latency_ms: extra?.latency_ms ?? null,
      });
    } catch {
      // never let ledger bookkeeping break a settled response
    }
  });

export function stashSale(headerValue: string | null, s: SaleCtx) {
  const nonce = paymentNonce(headerValue);
  if (nonce) saleCtx.set(nonce, s);
}

// The facilitator capability sync runs lazily; routes that build requirements
// outside the withX402 wrapper (MCP) must await it first.
let initPromise: Promise<void> | null = null;
export function ensureX402Init(): Promise<void> {
  initPromise ??= x402Server.initialize().catch((e) => {
    initPromise = null;
    throw e;
  });
  return initPromise;
}

// Both rails: USDC on Base Sepolia (headline) and native XLM on Stellar
// testnet (friendbot-funded, facilitator-sponsored fees). Buyers pick
// whichever they can sign.
type AcceptOption = {
  scheme: "exact";
  payTo: string;
  price: string | { asset: string; amount: string };
  network: `${string}:${string}`;
};
export function acceptsFor(usdPrice: string, xlmPrice: { asset: string; amount: string }): AcceptOption[] {
  return [
    { scheme: "exact", payTo: X402_PAY_TO, price: usdPrice, network: X402_NETWORK as `${string}:${string}` },
    { scheme: "exact", payTo: X402_PAY_TO_STELLAR, price: xlmPrice, network: X402_NETWORK_STELLAR as `${string}:${string}` },
  ];
}
