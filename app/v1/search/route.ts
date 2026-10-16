import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { x402Server, stashSale, acceptsFor } from "@/lib/x402";
import { embedText } from "@/lib/clip";
import { matchArtworks, corpusSize } from "@/lib/corpus";
import { enrich } from "@/lib/provenance";
import { PRICE_SEARCH, PRICE_SEARCH_XLM } from "@/lib/env";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const RESULT_EXAMPLE = {
  query: "storm at sea",
  results: [
    {
      id: "met-435962",
      title: "Hagar in the Wilderness",
      artist: "Camille Corot",
      date: "1835",
      medium: "Oil on canvas",
      image: { display: "https://…", thumb: "https://…", width: 1400, height: 1000 },
      match: { distance: 0.9 },
      provenance: {
        museum: "The Metropolitan Museum of Art",
        accession: "38.64",
        rights: "CC0 1.0",
        rights_url: "https://creativecommons.org/publicdomain/zero/1.0/",
        verified: true,
        evidence_url: "https://www.metmuseum.org/art/collection/search/435962",
      },
    },
  ],
  corpus: { size: 22099, sources: ["met", "cle", "aic", "nga"] },
};

const handler = async (req: NextRequest): Promise<NextResponse> => {
  const t0 = Date.now();
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 300);
  const n = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("n") || "5", 10) || 5, 1), 12);
  if (!q) {
    return NextResponse.json(
      { error: "missing_query", message: "Pass ?q=<search text>. Public-domain artworks, sold per call." },
      { status: 400 }
    );
  }
  try {
    const emb = await embedText(q);
    const rows = await matchArtworks(emb, n);
    const works = (await enrich(rows)).filter((w) => w.provenance.rights_check !== "refuted");
    const size = await corpusSize();
    stashSale(req.headers.get("payment-signature"), {
      endpoint: "text",
      query_hint: q.slice(0, 120),
      artwork_ids: works.map((w) => w.id),
      latency_ms: Date.now() - t0,
    });
    return NextResponse.json({
      query: q,
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
    return NextResponse.json({ error: "search_failed", message: e?.message?.slice(0, 200) ?? "search failed" }, { status: 502 });
  }
};

export const GET = withX402(
  handler,
  {
    "/v1/search": {
      accepts: acceptsFor(PRICE_SEARCH, PRICE_SEARCH_XLM),
      description: "Search the public-domain artwork corpus by text. Returns works with machine-readable provenance and license proof.",
      mimeType: "application/json",
      extensions: declareDiscoveryExtension({
        input: { q: "storm at sea", n: 5 },
        inputSchema: {
          properties: {
            q: { type: "string", description: "Search text" },
            n: { type: "integer", description: "Number of results, 1-12, default 5" },
          },
          required: ["q"],
        },
        output: { example: RESULT_EXAMPLE },
      }),
    },
  },
  x402Server
);
