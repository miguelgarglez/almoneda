# almoneda

**An auction house where machines are the only bidders.**

Agents pay per call over [x402](https://x402.org) and get public-domain artworks with machine-readable provenance and license proof. Humans get a sales floor to watch.

Live: **https://almoneda-app.vercel.app**

## What it is

22,000+ public-domain artworks from four museums — the Met, Cleveland, the Art Institute of Chicago, and the National Gallery of Art — searchable by text (CLIP embeddings) or by image (CLIP vision). Every result carries the museum's own accession number, a rights statement, a verification flag, and a link to the evidence. Nothing is sold as verified that wasn't actually verified.

Every paid call settles on-chain through x402 and lands on a public ledger — the sales floor.

## For agents

| Endpoint | Price |
| --- | --- |
| `GET /v1/search?q=<text>&n=<1-12>` | $0.01 |
| `POST /v1/search/image` `{ image_url }` or `{ image_base64 }` | $0.02 |
| `POST /mcp` — tools `search_artworks`, `search_by_image`, `get_status` | $0.01–0.02 |
| `GET /v1/demo/search?q=<text>` — unpaid preview | free, 3×/day |
| `GET /v1/floor` — the sales ledger | free |
| `GET /v1/status` | free |

Payment rails (both are returned in every `accepts` array):

- **USDC on Base Sepolia** (`eip155:84532`) — `$0.01`/`$0.02`, facilitator `x402.org`
- **XLM on Stellar testnet** (`stellar:testnet`) — `0.01`/`0.02` XLM via the native SAC, fees sponsored by the facilitator

Agent-facing docs are on the service itself:

- `GET /llms.txt` — the guide
- `GET /openapi.json` — the contract
- `GET /.well-known/x402` — the x402 Bazaar discovery declaration

### A paid call in one breath

```
GET /v1/search?q=storm%20at%20sea         → 402 Payment Required
PAYMENT-REQUIRED: accepts[USDC·BaseSepolia, XLM·StellarTestnet]
sign → retry with PAYMENT-SIGNATURE        → 200 OK + PAYMENT-RESPONSE
```

`scripts/http-buyer.mjs` and `scripts/mcp-buyer.mjs` are working buyer clients (Stellar rail).

## For humans

The homepage is the floor: the current lot on the block, a bidding console that dispatches a real agent with a testnet purse (watch the 402 → sign → settle roundtrip), and the live ledger with paddles, rails, and explorer links.

## Provenance, not vibes

- **Met** — accession and public-domain flags seeded from the official `MetObjects.csv`; Commons-hosted works re-checkable against their file pages.
- **Cleveland** — rights re-checked per object against the open-access API, lazily, then cached.
- **Art Institute of Chicago** — `is_public_domain` verified per object via the artic.edu API.
- **National Gallery of Art** — NGA's published open-access policy; object pages linked as evidence.

Failed checks are never cached as permanent negatives, and `verified` is only `true` when a source was actually consulted.

## Stack

Next.js 16 · `@huggingface/transformers` (CLIP ViT-B/32, q8, 512-dim L2-normalized embeddings) · `sharp` · Supabase/Postgres (pgvector corpus + provenance cache + sales ledger) · x402 v2 (`@x402/next`, `@x402/evm`, `@x402/stellar`, `@x402/mcp`) · Vercel.

## Run it

```bash
npm install
cp .env.example .env.local   # SUPABASE_LAB_URL / _ANON_KEY / _SERVICE_KEY, optional test purses
npm run dev
```

`supabase/migrations/` holds the schema (`almoneda.provenance`, `almoneda.sales`). `scripts/seed-provenance.mjs` seeds Met accessions from `MetObjects.csv`.

## Deploy

Serverless functions need the linux/arm64 native binaries (onnxruntime, sharp) traced into the bundle — `next.config.ts` does that, and `scripts/ensure-linux-binaries.mjs` (postinstall) makes sure the arm64 `@img` packages exist no matter the build machine's platform. Deploy from a local build for deterministic function payloads:

```bash
vercel build --prod && vercel deploy --prod --prebuilt
```

Testnet only. The USDC receiver is a dedicated test wallet; the XLM receiver likewise.
