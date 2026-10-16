// Lazy per-work license verification. Every artwork we sell is claimed as
// public domain / CC0; this module re-checks that claim against the museum's
// own API at serve time and caches the result forever.
import { env } from "./env";
import { CorpusRow, MUSEUMS } from "./corpus";

export type Provenance = {
  museum: string;
  accession: string | null;
  rights: string;
  rights_url: string;
  verified: boolean;
  evidence_url: string;
};

const svc = {
  apikey: env.supabaseService,
  Authorization: `Bearer ${env.supabaseService}`,
  "Content-Type": "application/json",
  "Accept-Profile": "almoneda",
  "Content-Profile": "almoneda",
};

const anon = {
  apikey: env.supabaseAnon,
  Authorization: `Bearer ${env.supabaseAnon}`,
  "Accept-Profile": "almoneda",
};

async function cached(ids: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  if (!ids.length) return out;
  try {
    const res = await fetch(
      `${env.supabaseUrl}/rest/v1/provenance?artwork_id=in.(${ids.map((i) => `"${i}"`).join(",")})`,
      { headers: anon }
    );
    if (res.ok) for (const r of await res.json()) out.set(r.artwork_id, r);
  } catch {}
  return out;
}

async function cachePut(rows: any[]): Promise<void> {
  if (!rows.length) return;
  try {
    await fetch(`${env.supabaseUrl}/rest/v1/provenance`, {
      method: "POST",
      headers: { ...svc, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
  } catch {}
}

const T = (ms: number) => new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));
async function fetchJson(url: string, ms = 2500): Promise<any> {
  return Promise.race([
    fetch(url, { headers: { "User-Agent": "almoneda/1.0 (public-domain image service)" } }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))),
    T(ms),
  ]);
}

// Per-museum verification. Returns null when the source can't be checked —
// the work still sells, but with verified:false and the source's blanket
// rights statement.
async function verifyOne(a: CorpusRow): Promise<Partial<Provenance>> {
  const src = a.source;
  if (src === "met") {
    const oid = a.id.split("-")[1];
    // Met's collection API is Incapsula-walled. Met works served from
    // Commons (P18) get their license re-checked against the file page;
    // metmuseum-hosted works are covered by the CSV-seeded cache.
    if (a.image_url.includes("commons.wikimedia.org")) {
      const file = decodeURIComponent(a.image_url.split("Special:FilePath/")[1]?.split("?")[0] ?? "");
      const j = await fetchJson(
        `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent("File:" + file)}&prop=imageinfo&iiprop=extmetadata&format=json`
      );
      const meta = (Object.values(j?.query?.pages ?? {})[0] as any)?.imageinfo?.[0]?.extmetadata;
      const lic = meta?.LicenseShortName?.value;
      return { accession: oid, rights: lic || "Public domain", rights_url: "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(file), verified: !!lic, evidence_url: a.object_url };
    }
    throw new Error("met: cache-only source");
  }
  if (src === "cle") {
    const acc = a.object_url.split("/art/")[1] ?? a.id.split("-")[1];
    const j = await fetchJson(`https://openaccess-api.clevelandart.org/api/artworks/${acc}`);
    const d = j?.data;
    return { accession: d?.accession_number ?? acc, verified: d?.share_license_status === "CC0", evidence_url: a.object_url };
  }
  if (src === "aic") {
    const oid = a.id.split("-")[1];
    const j = await fetchJson(`https://api.artic.edu/api/v1/artworks/${oid}?fields=main_reference_number,is_public_domain`);
    return { accession: j?.data?.main_reference_number ?? oid, verified: j?.data?.is_public_domain === true, evidence_url: a.object_url };
  }
  if (src === "nga") return { accession: a.id.split("-")[1], verified: false, evidence_url: a.object_url };
  return { accession: null, verified: false, evidence_url: a.object_url };
}

export async function enrich(artworks: CorpusRow[]): Promise<(CorpusRow & { provenance: Provenance })[]> {
  const ids = artworks.map((a) => a.id);
  const hit = await cached(ids);
  const missing = artworks.filter((a) => !hit.has(a.id));
  const fresh = new Map<string, any>();
  if (missing.length) {
    const rows = await Promise.all(
      missing.map(async (a) => {
        try {
          const v = await verifyOne(a);
          const museum = MUSEUMS[a.source];
          return {
            artwork_id: a.id,
            source: a.source,
            accession: v.accession ?? null,
            rights: v.rights ?? museum?.rights ?? "See source",
            rights_url: v.rights_url ?? museum?.rights_url ?? a.object_url,
            verified: v.verified ?? false,
            evidence_url: v.evidence_url ?? a.object_url,
            fetched_at: new Date().toISOString(),
            _ok: true,
          };
        } catch {
          // fetch failures are not cached — a museum being down today says
          // nothing about the rights claim
          return {
            artwork_id: a.id,
            source: a.source,
            accession: null,
            rights: MUSEUMS[a.source]?.rights ?? "See source",
            rights_url: MUSEUMS[a.source]?.rights_url ?? a.object_url,
            verified: false,
            evidence_url: a.object_url,
            fetched_at: new Date().toISOString(),
            _ok: false,
          };
        }
      })
    );
    for (const r of rows) fresh.set(r.artwork_id, r);
    void cachePut(rows.filter((r) => r._ok).map(({ _ok, ...r }) => r));
  }
  return artworks.map((a) => {
    const p = hit.get(a.id) ?? fresh.get(a.id) ?? {
      accession: null,
      rights: MUSEUMS[a.source]?.rights ?? "See source",
      rights_url: MUSEUMS[a.source]?.rights_url ?? a.object_url,
      verified: false,
      evidence_url: a.object_url,
    };
    return {
      ...a,
      provenance: {
        museum: MUSEUMS[a.source]?.name ?? a.source,
        accession: p.accession ?? null,
        rights: p.rights,
        rights_url: p.rights_url,
        verified: p.verified === true,
        evidence_url: p.evidence_url ?? a.object_url,
      },
    };
  });
}
