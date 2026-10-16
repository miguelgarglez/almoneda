// Re-score saved result lists (no retrieval re-run).
// usage: npx tsx eval/rescore.mjs results-baseline.json [results-x.json ...]
import fs from "node:fs";
import { scoreAll } from "./lib.mjs";

const labels = JSON.parse(fs.readFileSync(new URL("./labels.json", import.meta.url), "utf8"));
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8"));
  console.log(f, scoreAll(j.lists, labels));
}
