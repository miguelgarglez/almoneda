import { NextRequest, NextResponse } from "next/server";
import { corpusSize } from "@/lib/corpus";
import { hybridSearch } from "@/lib/retrieval";
import { enrich } from "@/lib/provenance";
import { takeQuota, giveQuota, clientIp } from "@/lib/quota";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Free taste of the paid API: 3 searches per IP per day, 3 results each,
// same pipeline as /v1/search. Quota is atomic in Postgres.
const FREE_PER_DAY = 3;

export async function GET(req: NextRequest) {
  const key = `search:${clientIp(req)}`;
  if (!(await takeQuota(key, FREE_PER_DAY))) {
    return NextResponse.json(
      { error: "demo_quota", message: "Free desk limit reached (3/day). Agents pay per call: GET /v1/search, $0.01 USDC on Base Sepolia.", paid_endpoint: "/v1/search" },
      { status: 429 }
    );
  }

  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 300);
  if (!q) {
    await giveQuota(key);
    return NextResponse.json({ error: "missing_query", message: "Pass ?q=<search text>." }, { status: 400 });
  }
  try {
    const { works: fused } = await hybridSearch(q, 3);
    const works = (await enrich(fused)).filter((w) => w.provenance.rights_check !== "refuted").slice(0, 3);
    const size = await corpusSize();
    return NextResponse.json({
      query: q,
      demo: { note: "Agents pay $0.01 USDC per call via x402 — see /llms.txt" },
      results: works.map((w) => ({
        id: w.id,
        title: w.title,
        artist: w.artist,
        date: w.date,
        medium: w.medium,
        image: { display: w.image_url, thumb: w.thumb_url || w.image_url, width: w.img_w ?? null, height: w.img_h ?? null },
        match: { distance: w.distance ?? null, relevance: w.relevance, why: w.why },
        provenance: w.provenance,
      })),
      corpus: { size },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "search_failed", message: e?.message?.slice(0, 200) ?? "search failed" }, { status: 502 });
  }
}
