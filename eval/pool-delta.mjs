// Delta-pool: take the top-10 ids of a measured results file, find the ones
// with no usable label, download thumbs, and stage them for judge.mjs.
// usage: npx tsx eval/pool-delta.mjs results-hybrid-v1.json
import fs from "node:fs";
import path from "node:path";
import { QUERIES, artworksByIds } from "./lib.mjs";

const file = process.argv[2];
const results = JSON.parse(fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8"));
const labelsPath = new URL("./labels.json", import.meta.url).pathname;
const labels = JSON.parse(fs.readFileSync(labelsPath));
const poolPath = new URL("./pool.json", import.meta.url).pathname;
const pool = JSON.parse(fs.readFileSync(poolPath));
const THUMBS = new URL("./thumbs/", import.meta.url).pathname;
fs.mkdirSync(THUMBS, { recursive: true });

const needed = new Map(); // id -> qid
for (const q of QUERIES) {
  for (const id of (results.lists[q.id] ?? []).slice(0, 10)) {
    const lab = labels[q.id]?.[id];
    if (!lab || lab.score < 0) needed.set(id, q.id);
  }
}
console.log(`${needed.size} unjudged in top-10`);
const rows = await artworksByIds([...needed.keys()]);
let n = 0;
for (const [id, qid] of needed) {
  const r = rows.get(id);
  const img = r?.thumb_url || r?.image_url;
  if (!img) { labels[qid] ??= {}; labels[qid][id] = { score: -1, why: "no img" }; continue; }
  const f = path.join(THUMBS, `${id}.jpg`);
  if (!fs.existsSync(f)) {
    let u = img;
    if (u.includes("commons.wikimedia.org") && u.includes("Special:FilePath")) u += (u.includes("?") ? "&" : "?") + "width=320";
    try {
      const rr = await fetch(u, { headers: { "User-Agent": "almoneda-eval/1.0" } });
      if (!rr.ok) { labels[qid] ??= {}; labels[qid][id] = { score: -1, why: "fetch fail" }; continue; }
      fs.writeFileSync(f, Buffer.from(await rr.arrayBuffer()));
    } catch { continue; }
    n++;
  }
  // add to pool so judge picks it up
  pool[qid] ??= { q: QUERIES.find((x) => x.id === qid)?.q ?? "", candidates: [] };
  if (!pool[qid].candidates.some((c) => c.id === id)) pool[qid].candidates.push({ id, img });
}
fs.writeFileSync(poolPath, JSON.stringify(pool, null, 1));
fs.writeFileSync(labelsPath, JSON.stringify(labels, null, 1));
console.log(`downloaded ${n} new thumbs; run judge.mjs next`);
