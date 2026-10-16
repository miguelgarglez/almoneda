# almoneda

**An auction house where machines are the only bidders.**

Agents pay per call over [x402](https://x402.org) and get public-domain artworks with machine-readable provenance and license proof. Humans get a sales floor to watch.

Live: **https://almoneda-app.vercel.app**

## What it is

155,000+ public-domain artworks from four museums — the Met, Cleveland, the Art Institute of Chicago, and the National Gallery of Art — searchable by text (CLIP embeddings) or by image (CLIP vision). Every result carries the museum's own accession number, a rights statement, a verification flag, and a link to the evidence. Nothing is sold as verified that wasn't actually verified.

Every paid call settles on-chain through x402 and lands on a public ledger — the sales floor.

## For agents

| Endpoint | Price |
| --- | --- |
| `GET /v1/search?q=<text>&n=<1-12>` | $0.01 |
| `POST /v1/search/image` `{ image_url }` or `{ image_base64 }` | $0.02 |
| `POST /mcp` — tools `search_artworks`, `search_by_image`, `get_status` | $0.01–0.02 |
| `GET /v1/search?q=<text>&strict=1` — suppress low-relevance results | $0.01, uncharged 404 on a miss |
| `GET /v1/demo/search?q=<text>` — unpaid preview | free, 3×/day |
| `GET /v1/floor` — the sales ledger | free |
| `GET /v1/status` | free |

Payment rails (both are returned in every `accepts` array):

- **USDC on Base Sepolia** (`eip155:84532`) — `$0.01`/`$0.02`, facilitator `x402.org`
- **XLM on Stellar testnet** (`stellar:testnet`, secondary rail) — `0.01`/`0.02` XLM via the native SAC, fees sponsored by the facilitator; free testnet XLM from friendbot, no login needed

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

## Relevance is honest, and measured

Every result carries `match.relevance` — a calibrated 0–1 estimate, not raw CLIP similarity — plus `match.why`, the evidence behind it (visual similarity, which metadata fields matched, whether the full-text index corroborates). `strict=1` withholds everything below the threshold and returns an **uncharged** 404 instead of selling a bad answer.

This is measured, not asserted: `eval/` holds a judged 50-query benchmark (40 realistic + 10 adversarial) with 1,039 image-level labels from a different model family. On the full label set the shipped ordering scores **P@5 0.916** (0.728 under strict) and **nDCG@10 0.813**. An FTS/RRF hybrid leg (0.888) and prompt ensembling (0.920 at 4× embed cost) were both measured and rejected — the numbers are in `eval/results-final.json`.

An outside agent (Codex, no prior context) was handed two blog posts and a testnet wallet, found the service through `/.well-known/x402` + `/llms.txt`, paid seven searches over Stellar testnet (0.07 XLM, all txs on the public floor), verified six image URLs against museum CDNs, and shipped both posts with correct credits. A second model family (Claude Haiku via the AI Gateway) then scored each chosen image against its paragraph: five of six fits clean, one caption oversold its image. Its deliverables and receipts are the gate evidence.

## For humans

The homepage is the floor: the current lot on the block, a bidding console that dispatches a real agent with a testnet purse (watch the 402 → sign → settle roundtrip, then the gavel falls when the facilitator confirms), and the live ledger with paddles, rails, and explorer links. Every artwork on the page opens a catalogue tray in place; the bottom strip is a working list of recent settlements, and `/?sale=<tx>` deep-links any receipt.

## Provenance, not vibes

- **Met** — accession and public-domain flags seeded from the official `MetObjects.csv`; Commons-hosted works re-checkable against their file pages.
- **Cleveland** — rights re-checked per object against the open-access API, lazily, then cached.
- **Art Institute of Chicago** — `is_public_domain` verified per object via the artic.edu API.
- **National Gallery of Art** — NGA's published open-access policy; object pages linked as evidence.

Every result carries a `rights_check`: `verified` (per-object re-check confirmed open access), `asserted` (the museum asserts open access but no per-object check exists), `unchecked` (the check could not run — transient, never cached), or `refuted` (the museum's own data says the work is **not** open — those are excluded from results entirely). Failed checks are never cached as permanent negatives.

## Stack

Next.js 16 · `@huggingface/transformers` (CLIP ViT-B, q8, 512-dim L2-normalized embeddings — the live corpus model is auto-detected from stored probe fingerprints, so a corpus-side model swap needs no deploy) · `sharp` · Supabase/Postgres (pgvector corpus + provenance cache + sales ledger + mirrored museum metadata/tags for relevance evidence) · x402 v2 (`@x402/next`, `@x402/evm`, `@x402/stellar`, `@x402/mcp`) · Vercel.

## Run it

```bash
npm install
cp .env.example .env.local   # SUPABASE_LAB_URL / _ANON_KEY / _SERVICE_KEY, optional test purses
npm run dev
```

`supabase/migrations/` holds almoneda's own schema (`almoneda.provenance`, `almoneda.sales`, `almoneda.demo_quotas` + quota RPCs). `scripts/seed-provenance.mjs` seeds Met accessions from `MetObjects.csv`.

**Corpus prerequisite:** the artwork index itself is not in this repo. Search goes through a `match_artworks(query_embedding vector(512), match_count int)` RPC and an `artworks` table (columns `id, source, title, artist, date, medium, department, image_url, thumb_url, object_url, img_w, img_h`) in a `mellizo` Postgres schema — a pgvector index of CLIP ViT-B/32 embeddings built from museum open data. Point `SUPABASE_LAB_*` at a project that has that corpus, or build your own with the same contract; every endpoint will then work unchanged. The buyer scripts read env vars directly (`~/.config/lab/secrets.env` is only an optional local fallback).

## Deploy

Serverless functions need the linux native binaries (onnxruntime, sharp) traced into the bundle for **both** arm64 and x64 — `next.config.ts` traces both, and `scripts/ensure-linux-binaries.mjs` (postinstall) fetches the `@img` packages for both arches no matter the build machine's platform. Deploy from a local build for deterministic function payloads:

```bash
vercel build --prod && vercel deploy --prod --prebuilt
```

Testnet only. The USDC receiver is a dedicated test wallet; the Stellar `payTo` is a run-generated testnet account, not a real wallet — friendbot money in, nothing out.
