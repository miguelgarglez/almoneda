// Retrieval: pgvector CLIP leg + keyword coverage re-rank (the measured best
// on eval/labels.json: P@5 0.916, nDCG@10 0.813). The full-text metadata leg
// still runs — as evidence for `why`/`relevance`, not ordering: offline
// sweeps (eval/fuse.mjs, 1344 configs) found no RRF/weighted fusion that
// beats keyword re-rank alone on this corpus, so we ship the honest one.
import { corpusModel, matchArtworks, metaSearch, type CorpusRow } from "./corpus";
import { embedText } from "./clip";
import { env } from "./env";

export type ScoredWork = CorpusRow & {
  relevance: number;          // 0-1, calibrated against judged labels
  why: string[];              // evidence: matched terms + visual similarity
  vec_rank: number | null;
  text_rank: number | null;
};

const VEC_K = 30;   // baseline depth (n*3 at n=10) — swept, deeper didn't help
const TEXT_K = 40;
const KW_WEIGHT = 0.3; // keyword coverage bonus, same weight as shipped v1

// Cosine distance → relevance: judged-relevant text-image matches in this
// corpus sit roughly at d<=0.80; the production failure that triggered this
// round ("storm at sea" -> Judgment of Solomon) was d=0.87.
const VEC_FLOOR = 0.86; // distance at/above which visual similarity counts for nothing
const VEC_SPAN = 0.22;  // d = FLOOR-SPAN -> full visual credit

// strict mode: results below this are withheld and the call is not charged.
export const STRICT_THRESHOLD = 0.5;

const STOP = new Set(["a", "an", "the", "of", "in", "on", "at", "and", "with", "by", "for", "to", "my", "its", "no"]);

function terms(q: string): string[] {
  return q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
}

// Metadata the FTS leg matched on, fetched for matched-term evidence.
async function metaByIds(ids: string[]): Promise<Map<string, { title: string; artist: string; medium: string; department: string; tags: string }>> {
  const out = new Map<string, any>();
  if (!ids.length) return out;
  try {
    const res = await fetch(
      `${env.supabaseUrl}/rest/v1/artwork_meta?select=artwork_id,title,artist,medium,department,tags&artwork_id=in.(${ids.map((i) => `"${i}"`).join(",")})`,
      { headers: { apikey: env.supabaseService, Authorization: `Bearer ${env.supabaseService}`, "Accept-Profile": "almoneda" } }
    );
    if (res.ok) for (const r of await res.json()) out.set(r.artwork_id, r);
  } catch {}
  return out;
}

export function vecRel(distance: number | undefined | null): number {
  if (distance == null || !Number.isFinite(distance)) return 0;
  return Math.min(1, Math.max(0, (VEC_FLOOR - distance) / VEC_SPAN));
}

export type SearchDiag = { model: string; vec_hits: number; text_hits: number; fused: number };

export async function hybridSearch(q: string, n: number): Promise<{ works: ScoredWork[]; diag: SearchDiag }> {
  const model = await corpusModel();
  const [vecRows, textHits] = await Promise.all([
    embedText(q, model).then((e) => matchArtworks(e, VEC_K)).catch(() => [] as CorpusRow[]),
    metaSearch(q, TEXT_K).catch(() => [] as { artwork_id: string; rank: number }[]),
  ]);

  const textRank = new Map(textHits.map((h, i) => [h.artwork_id, i + 1] as const));
  const meta = await metaByIds(vecRows.map((r) => r.id));

  // Ordering: cosine distance minus keyword coverage over the same four
  // fields the shipped v1 rerank used (the measured best). `matched`/`why`
  // and the relevance score also see tags — evidence, not ordering.
  const ts = terms(q);
  const works: ScoredWork[] = vecRows.map((r, i) => {
    const m = meta.get(r.id);
    const hayBase = `${m?.title ?? r.title} ${m?.artist ?? r.artist} ${m?.medium ?? r.medium} ${m?.department ?? r.department}`.toLowerCase();
    const hayAll = `${hayBase} ${(m?.tags ?? "").toLowerCase()}`;
    const cov = ts.length ? ts.filter((t) => hayBase.includes(t)).length / ts.length : 0;
    const matched = ts.filter((t) => hayAll.includes(t));
    const vr = vecRel(r.distance);
    const tRank = textRank.get(r.id) ?? null;
    const relevance = Math.min(1, 0.6 * vr + 0.45 * cov + (tRank != null ? 0.08 : 0));
    const why: string[] = [];
    if (r.distance != null) why.push(`visual similarity ${(Math.max(0, 1 - r.distance) * 100).toFixed(0)}%`);
    if (matched.length) why.push(`metadata match: ${matched.join(", ")}`);
    return {
      ...r,
      relevance: Math.round(relevance * 1000) / 1000,
      why,
      vec_rank: i + 1,
      text_rank: tRank,
      _score: (r.distance ?? 1) - KW_WEIGHT * cov,
    } as ScoredWork & { _score: number };
  });
  works.sort((a: any, b: any) => a._score - b._score);
  for (const w of works) delete (w as any)._score;
  return {
    works: works.slice(0, Math.max(n, 12)),
    diag: { model, vec_hits: vecRows.length, text_hits: textHits.length, fused: works.length },
  };
}
