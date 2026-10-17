import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TXT = `# almoneda

> Public-domain artworks for paying agents. Pay per call over x402 — USDC on Base Sepolia, or XLM on Stellar testnet. Every response carries machine-readable provenance and license proof.

almoneda is an image desk for agents: search a large corpus of public-domain and CC0 artworks (Met, Cleveland, Art Institute of Chicago, National Gallery of Art) by text or by image, and receive artworks you may legally reuse, each with museum, accession number, object URL, rights statement, and a verification flag re-checked against the museum's own data.

## Endpoints

- GET  {origin}/v1/search?q=<text>&n=<1-12>      — $0.01 per call (x402)
- POST {origin}/v1/search/image                  — $0.02 per call (x402). Body: {"image_url": "https://..."} or {"image_base64": "..."}
- POST {origin}/mcp                              — paid MCP tools (search_artworks, search_by_image, get_status) over Streamable HTTP JSON-RPC
- GET  {origin}/v1/status                        — free: corpus size, recent sales, prices
- GET  {origin}/v1/floor                         — free: the public sales ledger + the lot on the block
- GET  {origin}/v1/demo/search?q=<text>          — free unpaid preview (rate-limited)
- GET  {origin}/openapi.json                     — OpenAPI 3.1 document
- GET  {origin}/.well-known/x402                 — x402 service declaration (Bazaar)

## How to pay (x402 v2)

1. Call a paid endpoint. You get HTTP 402 with a PAYMENT-REQUIRED header: base64 JSON {x402Version, accepts[]}.
2. Pick a rail from accepts[]:
   - USDC on Base Sepolia — network "eip155:84532", asset USDC 0x036CbD53842c5426634e7929541eC2318f3dCF7e, exact scheme, EIP-3009. The facilitator pays gas; you need testnet USDC only (Circle faucet).
   - XLM on Stellar testnet (secondary rail) — network "stellar:testnet", asset = native XLM Soroban contract CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC, exact scheme. Fees are sponsored; free testnet XLM from https://friendbot.stellar.org/?addr=<your G-address>. Easiest rail when the USDC faucet is down.
3. Sign the payment per the scheme (EIP-3009 typed data, or the Soroban auth entry the SDK builds).
4. Retry with header PAYMENT-SIGNATURE: base64 of {x402Version:2, resource, accepted, payload}.
5. Receive 200 + PAYMENT-RESPONSE header with {transaction, payer, network} — the tx is public on the explorer.

Notes: the 402 body is empty — everything lives in the PAYMENT-REQUIRED header. If a correctly-signed payment is answered with another 402 and an empty body, wait a few seconds and retry once; facilitator verification is occasionally transient.

Or use the SDK: npm i @x402/fetch @x402/evm viem (or @x402/stellar); wrapFetchWithPayment(fetch, client) handles steps 1-5.

## MCP

POST {origin}/mcp speaks JSON-RPC 2.0 (Streamable HTTP, stateless). tools/list shows search_artworks, search_by_image, get_status. Paid tools return JSON-RPC error code 402 whose data is a PaymentRequired document; retry the tools/call with the payment in params._meta["x402/payment"] (a PaymentPayload). Settlement arrives in result._meta["x402/payment-response"].

## Receipts and honesty

- Every settled call is recorded publicly: GET /v1/floor lists recent sales with tx hashes and payer addresses. Image-search rows log only the source hostname — caller URLs may carry signed tokens and are never published.
- provenance.rights_check: "verified" = re-checked against the museum's own data/API per object; "asserted" = the museum asserts open access but no per-object check exists; "unchecked" = the check could not run (transient); "refuted" = the museum's own data says the work is not open — refuted works are excluded from results entirely.
- Everything runs on testnets. The money is test money; the protocol is the real one.
`;
export function GET(req: Request) {
  return new NextResponse(TXT.replaceAll("{origin}", new URL(req.url).origin), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
