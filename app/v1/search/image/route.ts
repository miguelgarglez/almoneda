import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { x402Server, stashSale, acceptsFor } from "@/lib/x402";
import { embedImage, decodeImage } from "@/lib/clip";
import { matchArtworks, corpusSize } from "@/lib/corpus";
import { enrich } from "@/lib/provenance";
import { PRICE_IMAGE, PRICE_IMAGE_XLM } from "@/lib/env";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const handler = async (req: NextRequest): Promise<NextResponse> => {
  const t0 = Date.now();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_body", message: "JSON body: { image_url } or { image_base64 }" }, { status: 400 });
  }
  const n = Math.min(Math.max(parseInt(body.n ?? "5", 10) || 5, 1), 12);
  try {
    let buf: ArrayBuffer;
    if (body.image_url && /^https?:\/\//.test(body.image_url)) {
      const r = await fetch(body.image_url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`image fetch ${r.status}`);
      const ct = r.headers.get("content-type") || "";
      if (!ct.startsWith("image/")) throw new Error(`not an image: ${ct}`);
      buf = await r.arrayBuffer();
      if (buf.byteLength > 8_000_000) throw new Error("image too large (max 8 MB)");
    } else if (body.image_base64) {
      const raw = Buffer.from(body.image_base64, "base64");
      if (raw.byteLength > 8_000_000) throw new Error("image too large (max 8 MB)");
      buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    } else {
      return NextResponse.json({ error: "missing_image", message: "JSON body: { image_url } or { image_base64 }" }, { status: 400 });
    }
    const img = await decodeImage(buf);
    const emb = await embedImage(img);
    const rows = await matchArtworks(emb, n);
    const works = await enrich(rows);
    const size = await corpusSize();
    stashSale(req.headers.get("payment-signature"), {
      endpoint: "image",
      query_hint: body.image_url ? String(body.image_url).slice(0, 120) : "base64 upload",
      artwork_ids: works.map((w) => w.id),
      latency_ms: Date.now() - t0,
    });
    return NextResponse.json({
      results: works.map((w) => ({
        id: w.id,
        title: w.title,
        artist: w.artist,
        date: w.date,
        medium: w.medium,
        department: w.department,
        image: { display: w.image_url, thumb: w.thumb_url || w.image_url, width: w.img_w ?? null, height: w.img_h ?? null },
        match: { distance: w.distance ?? null },
        provenance: w.provenance,
      })),
      corpus: { size, sources: ["met", "cle", "aic", "nga"] },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "image_search_failed", message: e?.message?.slice(0, 200) ?? "image search failed" }, { status: 502 });
  }
};

export const POST = withX402(
  handler,
  {
    "/v1/search/image": {
      accepts: acceptsFor(PRICE_IMAGE, PRICE_IMAGE_XLM),
      description: "Find public-domain artworks visually similar to an image (URL or base64). Provenance and license proof included.",
      mimeType: "application/json",
      extensions: declareDiscoveryExtension({
        input: { image_url: "https://example.com/photo.jpg", n: 5 },
        inputSchema: {
          properties: {
            image_url: { type: "string", description: "Public URL of an image" },
            image_base64: { type: "string", description: "Base64-encoded image (max 8 MB)" },
            n: { type: "integer", description: "Number of results, 1-12, default 5" },
          },
        },
        bodyType: "json",
        output: { example: { results: [{ id: "met-435962", title: "Hagar in the Wilderness" }] } },
      }),
    },
  },
  x402Server
);
