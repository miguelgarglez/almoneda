import { NextRequest, NextResponse } from "next/server";
import { x402Server, ensureX402Init } from "@/lib/x402";
import { embedText, embedImage, decodeImage } from "@/lib/clip";
import { fetchPublicImage } from "@/lib/images";
import { matchArtworks, corpusSize } from "@/lib/corpus";
import { enrich } from "@/lib/provenance";
import { salesCount, recentSales, insertSale } from "@/lib/ledger";
import { X402_NETWORK, X402_NETWORK_STELLAR, X402_PAY_TO, X402_PAY_TO_STELLAR, USDC_BASE_SEPOLIA, PRICE_SEARCH, PRICE_IMAGE, PRICE_SEARCH_XLM, PRICE_IMAGE_XLM } from "@/lib/env";
import { extractPaymentFromMeta, attachPaymentResponseToMeta, createPaymentRequiredError } from "@x402/mcp";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2025-06-18";
const priceUnits = (p: string) => String(Math.round(parseFloat(p.slice(1)) * 1_000_000));

const TOOLS = [
  {
    name: "search_artworks",
    title: "Search public-domain artworks",
    description: `Search the public-domain/CC0 artwork corpus by text. Returns works with machine-readable provenance (museum, accession, rights statement, license evidence). Paid: ${PRICE_SEARCH} per call via x402 (USDC Base Sepolia or XLM Stellar testnet).`,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text, e.g. 'storm at sea'" },
        n: { type: "integer", description: "Results, 1-12 (default 5)", minimum: 1, maximum: 12 },
      },
      required: ["query"],
    },
    paid: PRICE_SEARCH,
  },
  {
    name: "search_by_image",
    title: "Find artworks similar to an image",
    description: `Find public-domain/CC0 artworks visually similar to an image URL. Returns provenance and license proof. Paid: ${PRICE_IMAGE} per call via x402 (USDC Base Sepolia or XLM Stellar testnet).`,
    inputSchema: {
      type: "object",
      properties: {
        image_url: { type: "string", description: "Public URL of an image" },
        n: { type: "integer", description: "Results, 1-12 (default 5)", minimum: 1, maximum: 12 },
      },
      required: ["image_url"],
    },
    paid: PRICE_IMAGE,
  },
  {
    name: "get_status",
    title: "Service status (free)",
    description: "Corpus size, recent sales, prices, and facilitator health. Free.",
    inputSchema: { type: "object", properties: {} },
    paid: null as string | null,
  },
];

const xlmFor = (usd: string) => (usd === PRICE_SEARCH ? PRICE_SEARCH_XLM : PRICE_IMAGE_XLM);

async function buildAccepts(usdPrice: string) {
  // cold start: the facilitator capability sync may still be running — wait
  // for it so buildPaymentRequirements knows the registered kinds
  await ensureX402Init();
  const evm = await x402Server.buildPaymentRequirements({
    scheme: "exact", network: X402_NETWORK as any, payTo: X402_PAY_TO, price: usdPrice,
  });
  const xlm = await x402Server.buildPaymentRequirements({
    scheme: "exact", network: X402_NETWORK_STELLAR as any, payTo: X402_PAY_TO_STELLAR, price: xlmFor(usdPrice) as any,
  });
  return [...evm, ...xlm];
}

async function paymentRequiredBody(url: string, description: string, usdPrice: string, mimeType = "application/json") {
  const accepts = await buildAccepts(usdPrice);
  return {
    x402Version: 2,
    error: "PAYMENT-SIGNATURE required. Pay in _meta[\"x402/payment\"] and retry tools/call.",
    resource: { url, description, mimeType },
    accepts,
    extensions: {},
  };
}

// Dispatch is by tool name, not by which arguments happen to be present —
// otherwise search_artworks could trigger image inference at the text price.
async function runSearch(name: string, args: any): Promise<{ data: any; hint: string }> {
  const n = Math.min(Math.max(parseInt(args?.n ?? "5", 10) || 5, 1), 12);
  let emb: number[];
  let hint: string;
  if (name === "search_by_image") {
    const url = String(args?.image_url ?? "");
    if (!/^https?:\/\//.test(url)) throw new Error("search_by_image requires a public http(s) image_url");
    emb = await embedImage(await decodeImage(await fetchPublicImage(url)));
    hint = `img:${new URL(url).hostname}`;
  } else {
    const q = String(args?.query ?? "").slice(0, 300).trim();
    if (!q) throw new Error("search_artworks requires a non-empty query");
    emb = await embedText(q);
    hint = q;
  }
  const rows = await matchArtworks(emb, n);
  const works = (await enrich(rows)).filter((w) => w.provenance.rights_check !== "refuted");
  return {
    hint,
    data: {
      results: works.map((w) => ({
        id: w.id, title: w.title, artist: w.artist, date: w.date, medium: w.medium, department: w.department,
        image: { display: w.image_url, thumb: w.thumb_url || w.image_url, width: w.img_w ?? null, height: w.img_h ?? null },
        match: { distance: w.distance ?? null },
        provenance: w.provenance,
      })),
      corpus: { size: await corpusSize() },
    },
  };
}

const rpc = (id: any, result: any) => ({ jsonrpc: "2.0", id, result });
const rpcErr = (id: any, code: number, message: string, data?: any) => ({ jsonrpc: "2.0", id, error: { code, message, data } });

export async function POST(req: NextRequest) {
  let msgs: any[];
  try {
    const body = await req.json();
    msgs = Array.isArray(body) ? body : [body];
  } catch {
    return NextResponse.json(rpcErr(null, -32700, "Parse error"), { status: 400 });
  }

  const origin = req.nextUrl.origin;
  const out: any[] = [];
  let hasNotificationOnly = true;

  for (const m of msgs) {
    if (!m || typeof m !== "object" || m.jsonrpc !== "2.0") continue;
    const id = m.id;
    const isNotif = id === undefined;
    if (!isNotif) hasNotificationOnly = false;
    const method = m.method;

    if (method === "initialize") {
      out.push(rpc(id, {
        protocolVersion: m.params?.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "almoneda", version: "1.0.0", title: "almoneda — public-domain artworks for paying agents" },
        instructions: "Paid tools require x402 payment in _meta[\"x402/payment\"]. On insufficient payment the call returns error code 402 with a PaymentRequired document; pay either accept entry (USDC on Base Sepolia via EIP-3009, or native XLM on Stellar testnet via Soroban auth, fees sponsored) and retry with _meta[\"x402/payment\"] set to the PaymentPayload. Free: get_status, /llms.txt, /v1/demo/search.",
      }));
      continue;
    }
    if (isNotif) continue; // notifications get no response
    if (method === "ping") { out.push(rpc(id, {})); continue; }
    if (method === "tools/list") { out.push(rpc(id, { tools: TOOLS.map(({ paid, ...t }) => t) })); continue; }

    if (method === "tools/call") {
      const name = m.params?.name;
      const args = m.params?.arguments ?? {};
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) { out.push(rpcErr(id, -32602, `unknown tool: ${name}`)); continue; }

      if (!tool.paid) {
        try {
          const [size, total, recent] = await Promise.all([corpusSize(), salesCount(), recentSales(5)]);
          out.push(rpc(id, { content: [{ type: "text", text: JSON.stringify({ service: "almoneda", corpus: { size }, sales: { total, recent }, prices: { search_artworks: PRICE_SEARCH, search_by_image: PRICE_IMAGE }, network: X402_NETWORK, usdc: USDC_BASE_SEPOLIA, docs: `${origin}/llms.txt` }) }], isError: false }));
        } catch (e: any) {
          out.push(rpc(id, { content: [{ type: "text", text: `status failed: ${e?.message?.slice(0, 200)}` }], isError: true }));
        }
        continue;
      }

      // paid tool: validate args against the tool's own schema first so a
      // search_artworks call can't sneak image_url into the text path
      if (name === "search_artworks" && typeof args?.query !== "string") {
        out.push(rpcErr(id, -32602, "search_artworks requires arguments.query (string)"));
        continue;
      }
      if (name === "search_by_image" && typeof args?.image_url !== "string") {
        out.push(rpcErr(id, -32602, "search_by_image requires arguments.image_url (string)"));
        continue;
      }

      // verify payment from _meta["x402/payment"], run, settle
      const url = `${origin}/mcp`;
      const accepts = await buildAccepts(tool.paid);
      const payment = extractPaymentFromMeta(m.params);
      if (!payment) {
        const preq = await paymentRequiredBody(url, tool.description, tool.paid);
        const err = createPaymentRequiredError(preq as any);
        out.push({ jsonrpc: "2.0", id, error: { code: (err as any).code ?? 402, message: (err as any).message ?? "payment required", data: (err as any).data ?? preq } });
        continue;
      }
      try {
        // the client's payload carries the requirement it accepted; find it
        // among ours (or fall back to matching network+scheme)
        const chosen =
          accepts.find((a) => (payment as any).accepted && a.network === (payment as any).accepted.network && a.scheme === (payment as any).accepted.scheme && a.asset === (payment as any).accepted.asset) ??
          accepts.find((a) => a.network === (payment as any).accepted?.network) ??
          accepts[0];
        const v = await x402Server.verifyPayment(payment, chosen);
        if (!v.isValid) {
          out.push(rpcErr(id, 402, `payment invalid: ${(v as any).invalidReason ?? "unknown"}`, { invalidReason: (v as any).invalidReason }));
          continue;
        }
        const { data, hint } = await runSearch(name, args);
        const settle = await x402Server.settlePayment(payment, chosen);
        if (!settle || (settle as any).success === false) {
          out.push(rpcErr(id, 402, `settlement failed${(settle as any)?.errorReason ? `: ${(settle as any).errorReason}` : ""} — nothing was charged; retry the call`));
          continue;
        }
        try {
          await insertSale({
            payer: (settle as any)?.payer ?? "",
            tx: (settle as any)?.transaction ?? "",
            network: (settle as any)?.network ?? String(chosen.network),
            amount: String(chosen.amount ?? ""),
            endpoint: "mcp",
            query_hint: hint.slice(0, 120),
            artwork_ids: (data.results ?? []).map((w: any) => w.id),
            latency_ms: null,
          });
        } catch {}
        const result: any = { content: [{ type: "text", text: JSON.stringify(data) }], isError: false };
        out.push(rpc(id, attachPaymentResponseToMeta(result, settle as any)));
      } catch (e: any) {
        out.push(rpc(id, { content: [{ type: "text", text: `call failed: ${e?.message?.slice(0, 300)}` }], isError: true }));
      }
      continue;
    }
    out.push(rpcErr(id, -32601, `method not found: ${method}`));
  }

  if (!out.length && hasNotificationOnly) return new NextResponse(null, { status: 202 });
  return NextResponse.json(Array.isArray(msgs) && out.length !== 1 ? out : out[0] ?? null, {
    headers: { "content-type": "application/json", "mcp-protocol-version": PROTOCOL_VERSION },
  });
}

export async function GET() {
  return NextResponse.json(
    { error: "stream_not_supported", message: "POST JSON-RPC here. Stateless Streamable HTTP; see /llms.txt for the agent guide." },
    { status: 405 }
  );
}
