// Measure a pipeline against eval/labels.json.
// usage: npx tsx eval/measure.mjs baseline|hybrid|strict [--save tag]
import fs from "node:fs";
import { QUERIES, baselineSearch, hybrid, scoreAll } from "./lib.mjs";

const mode = process.argv[2] || "hybrid";
const saveTag = process.argv.indexOf("--save") >= 0 ? process.argv[process.argv.indexOf("--save") + 1] : null;
const labels = JSON.parse(fs.readFileSync(new URL("./labels.json", import.meta.url), "utf8"));

const lists = {};
for (const q of QUERIES) {
  let rows;
  if (mode === "baseline") rows = await baselineSearch(q.q, 10);
  else {
    rows = await hybrid(q.q, 10);
    if (mode === "strict") rows = rows.filter((w) => w.relevance >= 0.5);
  }
  lists[q.id] = rows.map((r) => r.id ?? r.artwork_id);
  console.log(`${q.id} ${lists[q.id].slice(0, 5).join(",")}`);
}

const scores = scoreAll(lists, labels);
console.log(mode, scores);

if (saveTag) {
  const out = { at: new Date().toISOString(), mode, scores, lists };
  const p = new URL(`./results-${saveTag}.json`, import.meta.url).pathname;
  fs.writeFileSync(p, JSON.stringify(out, null, 1));
  console.log(`wrote ${p}`);
}
