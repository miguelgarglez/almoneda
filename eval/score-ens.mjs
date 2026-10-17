// Scores prompt-ensemble variants (eval/legs-ens.json) with the same
// keyword re-rank + metrics as the baseline. Run: npx tsx eval/score-ens.mjs
import fs from "node:fs";
import { QUERIES, precisionAt, ndcgAt } from "./lib.mjs";

const ENS = JSON.parse(fs.readFileSync(new URL("./legs-ens.json", import.meta.url), "utf8"));
const LABELS = JSON.parse(fs.readFileSync(new URL("./labels.json", import.meta.url), "utf8"));
const OLDMETA = JSON.parse(fs.readFileSync(new URL("./legs.json", import.meta.url), "utf8"));

const URL_ = process.env.SUPABASE_LAB_URL;
const SVC = process.env.SUPABASE_LAB_SERVICE_KEY;

const STOP = new Set(["a", "an", "the", "of", "in", "on", "at", "and", "with", "by", "for", "to", "my", "its", "no"]);
const terms = (q) => q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
const FIELDS = ["title", "artist", "medium", "department"];

// collect every candidate id and fetch meta once
const allIds = new Set();
for (const v of Object.values(ENS.variants)) for (const q of QUERIES) for (const r of v[q.id] ?? []) allIds.add(r.id);
const meta = {};
{
  const ids = [...allIds];
  for (const q of QUERIES) Object.assign(meta, OLDMETA.queries[q.id]?.meta ?? {});
  const missing = ids.filter((id) => !meta[id]);
  for (let i = 0; i < missing.length; i += 80) {
    const chunk = missing.slice(i, i + 80);
    const res = await fetch(
      `${URL_}/rest/v1/artwork_meta?select=artwork_id,title,artist,medium,department&artwork_id=in.(${chunk.map((x) => `"${x}"`).join(",")})`,
      { headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Accept-Profile": "almoneda" } }
    );
    if (res.ok) for (const r of await res.json()) meta[r.artwork_id] = r;
  }
}

function covOf(id, ts) {
  const m = meta[id] ?? {};
  const hay = FIELDS.map((f) => m[f] ?? "").join(" ").toLowerCase();
  return ts.length ? ts.filter((t) => hay.includes(t)).length / ts.length : 0;
}

for (const a of [0.2, 0.3, 0.4]) {
  console.log(`--- rerank a=${a}`);
  for (const name of Object.keys(ENS.variants)) {
    let p5 = 0, p5s = 0, nd = 0, n = 0;
    const unjudged = new Set();
    for (const q of QUERIES) {
      const vec = ENS.variants[name][q.id] ?? [];
      const ts = terms(q.q);
      const ranked = vec.map((r) => [r.id, (r.d ?? 1) - a * covOf(r.id, ts)]).sort((x, y) => x[1] - y[1]).map(([id]) => id).slice(0, 10);
      for (const id of ranked) if (!LABELS[q.id]?.[id]) unjudged.add(`${q.id}:${id}`);
      n++;
      p5 += precisionAt(ranked, LABELS[q.id], 5, 1);
      p5s += precisionAt(ranked, LABELS[q.id], 5, 2);
      nd += ndcgAt(ranked, LABELS[q.id], 10);
    }
    console.log(`${name.padEnd(9)} P@5 ${(p5 / n).toFixed(3)}  strict ${(p5s / n).toFixed(3)}  nDCG ${(nd / n).toFixed(3)}  unjudged ${unjudged.size}`);
  }
}
