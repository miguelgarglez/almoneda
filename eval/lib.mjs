// Shared eval plumbing. Loads secrets, exposes the real retrieval pipelines
// (imported from lib/ so eval and prod cannot drift), plus metrics.
// Run with: npx tsx eval/<script>.mjs
import fs from "node:fs";
import path from "node:path";

const envFile = path.join(process.env.HOME, ".config/lab/secrets.env");
for (const l of (fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
}

const { hybridSearch } = await import("../lib/retrieval.ts");
const { matchArtworks, rerankByKeywords, metaSearch, artworksByIds, corpusModel } = await import("../lib/corpus.ts");
const { embedText } = await import("../lib/clip.ts");

export { matchArtworks, rerankByKeywords, metaSearch, artworksByIds, corpusModel, embedText };

export const QUERIES = JSON.parse(fs.readFileSync(new URL("./queries.json", import.meta.url), "utf8"));

// The shipped v1 pipeline: patch32/whatever-live embed -> vector top n*3 ->
// substring keyword re-rank. Kept frozen as the baseline to beat.
export async function baselineSearch(q, n = 10) {
  const model = await corpusModel();
  const emb = await embedText(q, model);
  return rerankByKeywords(await matchArtworks(emb, n * 3), q).slice(0, n);
}

export async function hybrid(q, n = 10) {
  const { works } = await hybridSearch(q, n);
  return works;
}

// metrics: labels = {qid: {artworkId: {score: 0|1|2, why}}}
const rel = (labelMap, id) => labelMap?.[id]?.score ?? 0;

export function precisionAt(ranked, labelMap, k = 5, minScore = 1) {
  const top = ranked.slice(0, k);
  if (!top.length) return 0;
  const hits = top.filter((id) => rel(labelMap, id) >= minScore).length;
  return hits / top.length; // unjudged count against precision: conservative
}

export function ndcgAt(ranked, labelMap, k = 10) {
  const gain = (s) => (s >= 2 ? 3 : s === 1 ? 1 : 0);
  let dcg = 0;
  ranked.slice(0, k).forEach((id, i) => {
    dcg += gain(rel(labelMap, id)) / Math.log2(i + 2);
  });
  const ideal = Object.values(labelMap ?? {}).map((v) => gain(v.score)).sort((a, b) => b - a).slice(0, k);
  let idcg = 0;
  ideal.forEach((g, i) => (idcg += g / Math.log2(i + 2)));
  return idcg ? dcg / idcg : 0;
}

export function scoreAll(rankedLists, labels) {
  let p5 = 0, p5s = 0, nd = 0, n = 0;
  for (const q of QUERIES) {
    const ranked = rankedLists[q.id];
    if (!ranked) continue;
    n++;
    p5 += precisionAt(ranked, labels[q.id], 5, 1);
    p5s += precisionAt(ranked, labels[q.id], 5, 2);
    nd += ndcgAt(ranked, labels[q.id], 10);
  }
  return { queries: n, "P@5": +(p5 / n).toFixed(3), "P@5_strict": +(p5s / n).toFixed(3), "nDCG@10": +(nd / n).toFixed(3) };
}
