// Delta-pool for the prompt-ensemble variants: compute each variant's
// reranked top-10, find (query,id) pairs with no label, download thumbs,
// and stage them into pool.json for judge.mjs.
// usage: npx tsx eval/pool-delta-ens.mjs
import fs from "node:fs";
import path from "node:path";
import { QUERIES, artworksByIds } from "./lib.mjs";

const ENS = JSON.parse(fs.readFileSync(new URL("./legs-ens.json", import.meta.url), "utf8"));
const OLDMETA = JSON.parse(fs.readFileSync(new URL("./legs.json", import.meta.url), "utf8"));
const labelsPath = new URL("./labels.json", import.meta.url).pathname;
const poolPath = new URL("./pool.json", import.meta.url).pathname;
const labels = JSON.parse(fs.readFileSync(labelsPath));
const pool = JSON.parse(fs.readFileSync(poolPath));
const THUMBS = new URL("./thumbs/", import.meta.url).pathname;
fs.mkdirSync(THUMBS, { recursive: true });

const URL_ = process.env.SUPABASE_LAB_URL;
const SVC = process.env.SUPABASE_LAB_SERVICE_KEY;
const STOP = new Set(["a", "an", "the", "of", "in", "on", "at", "and", "with", "by", "for", "to", "my", "its", "no"]);
const terms = (q) => q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
const FIELDS = ["title", "artist", "medium", "department"];
const A = 0.3;

// meta for every candidate id (reuse legs.json meta, fetch the rest)
const meta = {};
for (const q of QUERIES) Object.assign(meta, OLDMETA.queries[q.id]?.meta ?? {});
const allIds = new Set();
for (const v of Object.values(ENS.variants)) for (const q of QUERIES) for (const r of v[q.id] ?? []) allIds.add(r.id);
const missing = [...allIds].filter((id) => !meta[id]);
for (let i = 0; i < missing.length; i += 80) {
  const chunk = missing.slice(i, i + 80);
  const res = await fetch(
    `${URL_}/rest/v1/artwork_meta?select=artwork_id,title,artist,medium,department&artwork_id=in.(${chunk.map((x) => `"${x}"`).join(",")})`,
    { headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Accept-Profile": "almoneda" } }
  );
  if (res.ok) for (const r of await res.json()) meta[r.artwork_id] = r;
}
const covOf = (id, ts) => {
  const hay = FIELDS.map((f) => meta[id]?.[f] ?? "").join(" ").toLowerCase();
  return ts.length ? ts.filter((t) => hay.includes(t)).length / ts.length : 0;
};

// reranked top-10 per variant; collect unjudged pairs
const needed = new Map(); // `${qid}|${id}` -> {qid, id}
const VARIANTS = ["painting", "ens2", "ens4"];
for (const name of VARIANTS) {
  for (const q of QUERIES) {
    const ts = terms(q.q);
    const top = (ENS.variants[name][q.id] ?? [])
      .map((r) => [r.id, (r.d ?? 1) - A * covOf(r.id, ts)])
      .sort((x, y) => x[1] - y[1])
      .slice(0, 10)
      .map(([id]) => id);
    for (const id of top) {
      const lab = labels[q.id]?.[id];
      if (!lab || lab.score < 0) needed.set(`${q.id}|${id}`, { qid: q.id, id });
    }
  }
}
console.log(`${needed.size} unjudged (q,id) pairs across ${VARIANTS.join(",")}`);

const ids = [...new Set([...needed.values()].map((x) => x.id))];
const rows = await artworksByIds(ids);
let n = 0;
for (const id of ids) {
  const r = rows.get(id);
  const img = r?.thumb_url || r?.image_url;
  const f = path.join(THUMBS, `${id}.jpg`);
  if (!img) continue;
  if (!fs.existsSync(f)) {
    let u = img;
    if (u.includes("commons.wikimedia.org") && u.includes("Special:FilePath")) u += (u.includes("?") ? "&" : "?") + "width=320";
    try {
      const rr = await fetch(u, { headers: { "User-Agent": "almoneda-eval/1.0" } });
      if (rr.ok) { fs.writeFileSync(f, Buffer.from(await rr.arrayBuffer())); n++; }
    } catch {}
  }
}
for (const { qid, id } of needed.values()) {
  const r = rows.get(id);
  const img = r?.thumb_url || r?.image_url;
  if (!img || !fs.existsSync(path.join(THUMBS, `${id}.jpg`))) {
    labels[qid] ??= {};
    labels[qid][id] = { score: -1, why: "no img" };
    continue;
  }
  pool[qid] ??= { q: QUERIES.find((x) => x.id === qid)?.q ?? "", candidates: [] };
  if (!pool[qid].candidates.some((c) => c.id === id)) pool[qid].candidates.push({ id, img });
}
fs.writeFileSync(poolPath, JSON.stringify(pool, null, 1));
fs.writeFileSync(labelsPath, JSON.stringify(labels, null, 1));
console.log(`downloaded ${n} new thumbs; staged ${needed.size} pairs -> run judge.mjs`);
