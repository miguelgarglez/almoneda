// The artwork corpus: mellizo's pgvector index on the shared Lab Supabase.
// Read-only through PostgREST with Content-Profile: mellizo — never edit
// mellizo's repo or schema. Survives the r3 artworks swap: match_artworks
// keeps its (vector(512), int) signature; new columns arrive as extras.
import { env } from "./env";
import { PATCH16, PATCH32, PATCH32_PROBES, type CorpusModel } from "./corpus-fingerprints";

export type CorpusRow = {
  id: string;
  source: string;
  title: string;
  artist: string;
  date: string;
  medium: string;
  department: string;
  image_url: string;
  thumb_url: string;
  object_url: string;
  img_w?: number;
  img_h?: number;
  distance?: number;
};

// Which embedding space the live corpus uses. mellizo's round-3 swap replaces
// the table in place (same ids, same vector(512) signature, patch16 weights) —
// detected by comparing probe artworks' stored vectors against the patch32
// fingerprints captured pre-swap. Cached 5 min; a swap mid-process flips on
// the next window.
let modelCache: { model: CorpusModel; at: number } | null = null;
export async function corpusModel(): Promise<CorpusModel> {
  if (modelCache && Date.now() - modelCache.at < 5 * 60_000) return modelCache.model;
  try {
    const ids = Object.keys(PATCH32_PROBES).map((i) => `"${i}"`).join(",");
    const res = await fetch(`${env.supabaseUrl}/rest/v1/artworks?select=id,embedding&id=in.(${ids})`, {
      headers: { apikey: env.supabaseAnon, Authorization: `Bearer ${env.supabaseAnon}`, "Accept-Profile": "mellizo" },
      next: { revalidate: 0 },
    });
    if (res.ok) {
      const rows: { id: string; embedding: string | number[] }[] = await res.json();
      let matched = 0;
      for (const r of rows) {
        const cur = (typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding) as number[];
        const fp = PATCH32_PROBES[r.id];
        if (!fp || !cur || cur.length < fp.length) continue;
        let maxDiff = 0;
        for (let i = 0; i < fp.length; i++) maxDiff = Math.max(maxDiff, Math.abs(cur[i] - fp[i]));
        if (maxDiff < 0.002) matched++;
      }
      // Any probe still carrying its patch32 vector proves the old space is
      // live. Probes present but different (or gone) means the swap landed.
      const model: CorpusModel = matched > 0 ? PATCH32 : PATCH16;
      modelCache = { model, at: Date.now() };
      return model;
    }
  } catch {}
  return modelCache?.model ?? PATCH32;
}

// The text leg of hybrid search: full-text over the mirrored metadata table
// (title/tags A-weighted, artist B, medium/department C). Service role only —
// ranked metadata search is the product, even though rows are world-readable.
export type MetaHit = { artwork_id: string; rank: number };
export async function metaSearch(q: string, k = 40): Promise<MetaHit[]> {
  try {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/rpc/meta_search`, {
      method: "POST",
      headers: {
        apikey: env.supabaseService,
        Authorization: `Bearer ${env.supabaseService}`,
        "Content-Type": "application/json",
        "Content-Profile": "almoneda",
      },
      body: JSON.stringify({ q, k }),
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// Full rows for ids the FTS leg surfaced (they carry no distance).
export async function artworksByIds(ids: string[]): Promise<Map<string, CorpusRow>> {
  const out = new Map<string, CorpusRow>();
  if (!ids.length) return out;
  try {
    const res = await fetch(
      `${env.supabaseUrl}/rest/v1/artworks?select=id,source,title,artist,date,medium,department,image_url,thumb_url,object_url,img_w,img_h&id=in.(${ids.map((i) => `"${i}"`).join(",")})`,
      { headers: { apikey: env.supabaseAnon, Authorization: `Bearer ${env.supabaseAnon}`, "Accept-Profile": "mellizo" } }
    );
    if (res.ok) for (const r of await res.json()) out.set(r.id, r);
  } catch {}
  return out;
}

export async function matchArtworks(embedding: number[], matchCount = 8): Promise<CorpusRow[]> {
  const res = await fetch(`${env.supabaseUrl}/rest/v1/rpc/match_artworks`, {
    method: "POST",
    headers: {
      apikey: env.supabaseAnon,
      Authorization: `Bearer ${env.supabaseAnon}`,
      "Content-Type": "application/json",
      "Content-Profile": "mellizo",
    },
    body: JSON.stringify({ query_embedding: `[${embedding.join(",")}]`, match_count: matchCount }),
  });
  if (!res.ok) throw new Error(`corpus: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// CLIP distance alone is loose on long-tail queries — "storm at sea" can
// surface a calm portrait. Re-rank candidates by literal keyword overlap
// with title/artist/medium/department so words that appear in the record
// beat pure visual similarity. Distance stays in the output untouched.
const STOP = new Set(["a", "an", "the", "of", "in", "on", "at", "and", "with", "by", "for", "to", "my", "its"]);

export function rerankByKeywords(rows: CorpusRow[], q: string): CorpusRow[] {
  const terms = q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!terms.length) return rows;
  return rows
    .map((r) => {
      const hay = `${r.title} ${r.artist} ${r.medium} ${r.department}`.toLowerCase();
      const hit = terms.filter((t) => hay.includes(t)).length / terms.length;
      return { r, score: (r.distance ?? 1) - 0.3 * hit };
    })
    .sort((a, b) => a.score - b.score)
    .map((x) => x.r);
}

export async function corpusSize(): Promise<number | null> {
  // a HEAD count is cheap and doesn't depend on the corpus_size RPC, which
  // has timed out before and taken the whole "floor open" signal with it.
  // PostgREST flakes this occasionally (schema reloads, statement timeouts)
  // so retry once before reporting the corpus unreachable.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${env.supabaseUrl}/rest/v1/artworks?select=id&limit=0`, {
        method: "HEAD",
        headers: {
          apikey: env.supabaseAnon,
          Authorization: `Bearer ${env.supabaseAnon}`,
          "Accept-Profile": "mellizo",
          Prefer: "count=exact",
        },
      });
      const range = res.headers.get("content-range") || "";
      const n = parseInt(range.split("/")[1] || "", 10);
      if (Number.isFinite(n)) return n;
    } catch {}
  }
  return null;
}

// The current lot: deterministic per time window so every visitor on the
// floor sees the same work at the same moment.
export async function currentLot(windowMs = 120_000): Promise<CorpusRow | null> {
  const size = await corpusSize();
  if (!size) return null;
  const offset = Math.floor(Date.now() / windowMs) % size;
  const res = await fetch(
    `${env.supabaseUrl}/rest/v1/artworks?select=id,source,title,artist,date,medium,department,image_url,thumb_url,object_url,img_w,img_h&limit=1&offset=${offset}`,
    { headers: { apikey: env.supabaseAnon, Authorization: `Bearer ${env.supabaseAnon}`, "Accept-Profile": "mellizo" }, next: { revalidate: 60 } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] ?? null;
}

// Lot lookup for ledger rows: thumb, title, and the museum's own record so
// an expanded receipt names every delivered work and links its catalogue page.
export type SaleLot = {
  thumb: string;
  image: string;
  title: string;
  artist: string;
  museum: string;
  object_url: string | null;
};

export async function saleThumbs(ids: string[]): Promise<Map<string, SaleLot>> {
  const out = new Map<string, SaleLot>();
  if (!ids.length) return out;
  try {
    const res = await fetch(
      `${env.supabaseUrl}/rest/v1/artworks?select=id,title,artist,source,thumb_url,image_url,object_url&id=in.(${ids.map((i) => `"${i}"`).join(",")})`,
      { headers: { apikey: env.supabaseAnon, Authorization: `Bearer ${env.supabaseAnon}`, "Accept-Profile": "mellizo" } }
    );
    if (res.ok)
      for (const r of await res.json())
        out.set(r.id, {
          thumb: r.thumb_url || r.image_url,
          image: r.image_url || r.thumb_url,
          title: r.title,
          artist: r.artist ?? "",
          museum: MUSEUMS[r.source]?.name ?? r.source,
          object_url: r.object_url ?? null,
        });
  } catch {}
  return out;
}

export const MUSEUMS: Record<string, { name: string; rights: string; rights_url: string }> = {
  met: { name: "The Metropolitan Museum of Art", rights: "CC0 1.0", rights_url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  cle: { name: "Cleveland Museum of Art", rights: "CC0 1.0", rights_url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  aic: { name: "Art Institute of Chicago", rights: "CC0 1.0", rights_url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  nga: { name: "National Gallery of Art", rights: "NGA Open Access", rights_url: "https://www.nga.gov/notices/open-access-policy" },
};
