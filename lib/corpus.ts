// The artwork corpus: mellizo's pgvector index on the shared Lab Supabase.
// Read-only through PostgREST with Content-Profile: mellizo — never edit
// mellizo's repo or schema. Survives the r3 artworks swap: match_artworks
// keeps its (vector(512), int) signature; new columns arrive as extras.
import { env } from "./env";

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

export async function corpusSize(): Promise<number | null> {
  try {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/rpc/corpus_size`, {
      method: "POST",
      headers: {
        apikey: env.supabaseAnon,
        Authorization: `Bearer ${env.supabaseAnon}`,
        "Content-Type": "application/json",
        "Content-Profile": "mellizo",
      },
      body: "{}",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
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

export const MUSEUMS: Record<string, { name: string; rights: string; rights_url: string }> = {
  met: { name: "The Metropolitan Museum of Art", rights: "CC0 1.0", rights_url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  cle: { name: "Cleveland Museum of Art", rights: "CC0 1.0", rights_url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  aic: { name: "Art Institute of Chicago", rights: "CC0 1.0", rights_url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  nga: { name: "National Gallery of Art", rights: "NGA Open Access", rights_url: "https://www.nga.gov/notices/open-access-policy" },
};
