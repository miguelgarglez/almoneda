// Offline fusion-parameter sweep over eval/legs.json. Scores each config
// against eval/labels.json with the same metrics as rescore.mjs.
// Run: npx tsx eval/fuse.mjs
import fs from "node:fs";
import { QUERIES, precisionAt, ndcgAt } from "./lib.mjs";

const LEGS = JSON.parse(fs.readFileSync(new URL("./legs.json", import.meta.url), "utf8"));
const LABELS = JSON.parse(fs.readFileSync(new URL("./labels.json", import.meta.url), "utf8"));

const STOP = new Set(["a", "an", "the", "of", "in", "on", "at", "and", "with", "by", "for", "to", "my", "its", "no"]);
const terms = (q) => q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

// coverage over the same fields baseline rerankByKeywords sees
function covOf(id, meta, ts, fields) {
  const m = meta[id] ?? {};
  const hay = fields.map((f) => m[f] ?? "").join(" ").toLowerCase();
  return ts.length ? ts.filter((t) => hay.includes(t)).length / ts.length : 0;
}
const BASE_FIELDS = ["title", "artist", "medium", "department"];
const ALL_FIELDS = [...BASE_FIELDS, "tags"];

// score = distance - a*cov - b*textPresence - c*textPos   (lower is better)
//   a, fields: keyword coverage weight (baseline rerank uses a=0.3 on vec top-30)
//   b: flat bonus for being in the text leg at all
//   c: positional bonus scaled by (1 - textRank/40)
//   admitTextOnly: whether text-leg items absent from vec top-K may enter
function rank(entry, ts, cfg) {
  const textRank = new Map(entry.text.map((h, i) => [h.id, i + 1]));
  const cand = new Map();
  entry.vec.slice(0, cfg.depth).forEach((v) => cand.set(v.id, v.d ?? 1));
  if (cfg.admitTextOnly) {
    for (const h of entry.text) {
      if (cand.has(h.id)) continue;
      const cov = covOf(h.id, entry.meta, ts, ALL_FIELDS);
      if (cov >= (cfg.admitCov ?? 1)) cand.set(h.id, 1.0); // worst-case distance
    }
  }
  return [...cand.entries()]
    .map(([id, d]) => {
      const tr = textRank.get(id);
      const s = d
        - cfg.a * covOf(id, entry.meta, ts, cfg.fields)
        - (tr ? cfg.b + cfg.c * (1 - tr / 40) : 0);
      return [id, s];
    })
    .sort((x, y) => x[1] - y[1])
    .map(([id]) => id)
    .slice(0, 10);
}

function evalCfg(cfg) {
  const lists = {};
  const unjudged = new Set();
  for (const q of QUERIES) {
    const e = LEGS.queries[q.id];
    if (!e) continue;
    lists[q.id] = rank(e, terms(q.q), cfg);
    for (const id of lists[q.id]) if (!LABELS[q.id]?.[id]) unjudged.add(`${q.id}:${id}`);
  }
  let p5 = 0, p5s = 0, nd = 0, n = 0;
  for (const q of QUERIES) {
    if (!lists[q.id]) continue;
    n++;
    p5 += precisionAt(lists[q.id], LABELS[q.id], 5, 1);
    p5s += precisionAt(lists[q.id], LABELS[q.id], 5, 2);
    nd += ndcgAt(lists[q.id], LABELS[q.id], 10);
  }
  return { cfg, p5: +(p5 / n).toFixed(3), p5s: +(p5s / n).toFixed(3), nd: +(nd / n).toFixed(3), unjudged: unjudged.size };
}

// sanity: reproduce the baseline (a=0.3, base fields, depth 30, no text leg)
console.log("baseline-replica", evalCfg({ a: 0.3, b: 0, c: 0, depth: 30, fields: BASE_FIELDS }));

const rows = [];
for (const a of [0.15, 0.2, 0.25, 0.3, 0.35, 0.45, 0.6])
  for (const b of [0, 0.02, 0.05, 0.08, 0.12, 0.2])
    for (const c of [0, 0.02, 0.05, 0.1])
      for (const fields of [BASE_FIELDS, ALL_FIELDS])
        for (const admitTextOnly of [false, true])
          for (const admitCov of admitTextOnly ? [0.6, 0.75, 1] : [0])
            rows.push(evalCfg({ a, b, c, depth: 30, fields, admitTextOnly, admitCov }));
rows.sort((x, y) => y.p5 - x.p5 || y.nd - x.nd);
const distinct = [...new Map(rows.map((r) => [`${r.p5}/${r.nd}`, r])).values()];
console.log(`${rows.length} configs, ${distinct.length} distinct outcomes\n`);
console.log("a    b    c    fields admit cov   P@5   strict nDCG  unjudged");
for (const r of distinct)
  console.log(
    `${r.cfg.a}  ${r.cfg.b}  ${r.cfg.c}  ${r.cfg.fields.length === 5 ? "+tags" : " base"}   ${r.cfg.admitTextOnly} ${r.cfg.admitCov}   ${r.p5}  ${r.p5s}  ${r.nd}  ${r.unjudged}`
  );
