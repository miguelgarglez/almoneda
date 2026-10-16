import { NextResponse } from "next/server";
import { corpusSize, currentLot, saleThumbs, MUSEUMS } from "@/lib/corpus";
import { salesCount, recentSales } from "@/lib/ledger";

export const dynamic = "force-dynamic";

// The sales floor feed: corpus stats, the lot on the block right now, and the
// last hammer falls. World-readable, no payment — the auction needs an
// audience.
export async function GET() {
  const [size, total, recent, lot] = await Promise.all([
    corpusSize(),
    salesCount(),
    recentSales(20),
    currentLot(),
  ]);
  const thumbs = await saleThumbs([...new Set(recent.map((s) => s.artwork_ids?.[0]).filter(Boolean))] as string[]);
  return NextResponse.json(
    {
      corpus: { size, sources: ["met", "cle", "aic", "nga"] },
      sales: {
        total,
        recent: recent.map((s) => ({
          id: s.id,
          payer: s.payer,
          tx: s.tx,
          network: s.network,
          amount: s.amount,
          endpoint: s.endpoint,
          query_hint: s.query_hint,
          artwork_ids: s.artwork_ids,
          thumb: s.artwork_ids?.[0] ? (thumbs.get(s.artwork_ids[0])?.thumb ?? null) : null,
          lot_title: s.artwork_ids?.[0] ? (thumbs.get(s.artwork_ids[0])?.title ?? null) : null,
          lot_url: s.artwork_ids?.[0] ? (thumbs.get(s.artwork_ids[0])?.object_url ?? null) : null,
          latency_ms: s.latency_ms,
          created_at: s.created_at,
        })),
      },
      lot: lot
        ? {
            id: lot.id,
            title: lot.title,
            artist: lot.artist,
            date: lot.date,
            medium: lot.medium,
            image: { display: lot.image_url, thumb: lot.thumb_url || lot.image_url, width: lot.img_w ?? null, height: lot.img_h ?? null },
            museum: MUSEUMS[lot.source]?.name ?? lot.source,
            object_url: lot.object_url,
          }
        : null,
      prices: { "GET /v1/search": "$0.01", "POST /v1/search/image": "$0.02", "POST /mcp": "$0.01–0.02" },
    },
    { headers: { "cache-control": "public, max-age=5, stale-while-revalidate=30" } }
  );
}
