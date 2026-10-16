import { NextRequest, NextResponse } from "next/server";
import { embedText } from "@/lib/clip";
import { matchArtworks, corpusSize } from "@/lib/corpus";
import { enrich } from "@/lib/provenance";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Free taste of the paid API: 5 searches per IP per day, 3 results each,
// same pipeline as /v1/search. Rate limit is per instance — honest, not bulletproof.
const quota = new Map<string, { n: number; day: string }>();
const DAY = () => new Date().toISOString().slice(0, 10);

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const slot = quota.get(ip);
  const used = slot?.day === DAY() ? slot.n : 0;
  if (used >= 5) {
    return NextResponse.json(
      { error: "demo_quota", message: "Free desk limit reached (5/day). Agents pay per call: GET /v1/search, $0.01 USDC on Base Sepolia.", paid_endpoint: "/v1/search" },
      { status: 429 }
    );
  }
  quota.set(ip, { n: used + 1, day: DAY() });

  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 300);
  if (!q) return NextResponse.json({ error: "missing_query", message: "Pass ?q=<search text>." }, { status: 400 });
  try {
    const emb = await embedText(q);
    const rows = await matchArtworks(emb, 3);
    const works = await enrich(rows);
    const size = await corpusSize();
    return NextResponse.json({
      query: q,
      demo: { free_calls_left_today: 4 - used, note: "Agents pay $0.01 USDC per call via x402 — see /llms.txt" },
      results: works.map((w) => ({
        id: w.id,
        title: w.title,
        artist: w.artist,
        date: w.date,
        medium: w.medium,
        image: { display: w.image_url, thumb: w.thumb_url || w.image_url, width: w.img_w ?? null, height: w.img_h ?? null },
        match: { distance: w.distance ?? null },
        provenance: w.provenance,
      })),
      corpus: { size },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "search_failed", message: e?.message?.slice(0, 200) ?? "search failed" }, { status: 502 });
  }
}
