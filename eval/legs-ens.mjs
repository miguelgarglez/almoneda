// Prompt-ensemble test: CLIP zero-shot improves when the query is wrapped in
// domain templates ("a painting of X") and embeddings are averaged. Dumps
// vec top-30 for several template variants so fuse.mjs can score them.
// Run: npx tsx eval/legs-ens.mjs
import fs from "node:fs";
import { QUERIES, embedText, matchArtworks, corpusModel } from "./lib.mjs";

const VARIANTS = {
  raw: (q) => [q],
  painting: (q) => [`a painting of ${q}`],
  ens2: (q) => [q, `a painting of ${q}`],
  ens4: (q) => [q, `a painting of ${q}`, `a picture of ${q}`, `artwork depicting ${q}`],
};

function meanVec(vecs) {
  const out = new Array(vecs[0].length).fill(0);
  for (const v of vecs) for (let i = 0; i < v.length; i++) out[i] += v[i] / vecs.length;
  return out;
}

const model = await corpusModel();
const out = { model, variants: {} };
for (const [name, mk] of Object.entries(VARIANTS)) {
  out.variants[name] = {};
  for (const q of QUERIES) {
    const embs = await Promise.all(mk(q.q).map((t) => embedText(t, model)));
    const vec = await matchArtworks(meanVec(embs), 30).catch(() => []);
    out.variants[name][q.id] = vec.map((r) => ({ id: r.id, d: r.distance }));
  }
  console.log(name, "done");
}
fs.writeFileSync(new URL("./legs-ens.json", import.meta.url), JSON.stringify(out));
console.log("wrote eval/legs-ens.json");
