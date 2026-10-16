// Build the judged candidate pool: for each query, union the baseline top-12
// and the FTS top-12, then download thumbnails for the vision judge.
// usage: npx tsx eval/pool.mjs
import fs from "node:fs";
import { QUERIES, baselineSearch, metaSearch, artworksByIds } from "./lib.mjs";

const OUT = new URL("./pool.json", import.meta.url).pathname;
const THUMBS = new URL("./thumbs/", import.meta.url).pathname;
fs.mkdirSync(THUMBS, { recursive: true });

const pool = {};
for (const q of QUERIES) {
  const [vec, txt] = await Promise.all([
    baselineSearch(q.q, 12).catch(() => []),
    metaSearch(q.q, 12).catch(() => []),
  ]);
  const ids = new Set(vec.map((r) => r.id));
  const missing = txt.map((h) => h.artwork_id).filter((id) => !ids.has(id));
  const extra = await artworksByIds(missing.slice(0, 12));
  const cands = [...vec.map((r) => r.id), ...missing.slice(0, 12)];
  const urls = new Map();
  for (const r of vec) urls.set(r.id, r.thumb_url || r.image_url);
  for (const [id, r] of extra) urls.set(id, r.thumb_url || r.image_url);
  pool[q.id] = { q: q.q, candidates: cands.map((id) => ({ id, img: urls.get(id) })) };
  console.log(`${q.id} "${q.q}": ${cands.length} candidates`);
}
fs.writeFileSync(OUT, JSON.stringify(pool, null, 1));
console.log(`wrote ${OUT}`);

// download thumbs (small sizes where the museum supports it)
let n = 0;
for (const { candidates } of Object.values(pool)) {
  for (const c of candidates) {
    const f = `${THUMBS}${c.id}.jpg`;
    if (fs.existsSync(f) || !c.img) continue;
    let u = c.img;
    if (u.includes("commons.wikimedia.org") && u.includes("Special:FilePath")) u += (u.includes("?") ? "&" : "?") + "width=320";
    try {
      const r = await fetch(u, { headers: { "User-Agent": "almoneda-eval/1.0" } });
      if (!r.ok) continue;
      fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
      n++;
      if (n % 50 === 0) console.log(`thumbs ${n}`);
    } catch {}
  }
}
console.log(`downloaded ${n} thumbs`);
