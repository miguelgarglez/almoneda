// Dumps the raw retrieval legs per query (vector top-40 + text top-40 +
// metadata fields for every candidate id) so fusion parameters can be
// swept offline without re-embedding or re-hitting the museums.
// Run: npx tsx eval/legs-dump.mjs
import fs from "node:fs";
import { QUERIES, embedText, matchArtworks, metaSearch, corpusModel } from "./lib.mjs";

const URL_ = process.env.SUPABASE_LAB_URL;
const SVC = process.env.SUPABASE_LAB_SERVICE_KEY;

async function meta(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const res = await fetch(
      `${URL_}/rest/v1/artwork_meta?select=artwork_id,title,artist,medium,department,tags&artwork_id=in.(${chunk.map((x) => `"${x}"`).join(",")})`,
      { headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Accept-Profile": "almoneda" } }
    );
    if (res.ok) for (const r of await res.json()) out[r.artwork_id] = r;
  }
  return out;
}

const model = await corpusModel();
const out = { model, queries: {} };
for (const q of QUERIES) {
  const [vec, text] = await Promise.all([
    embedText(q.q, model).then((e) => matchArtworks(e, 40)).catch(() => []),
    metaSearch(q.q, 40).catch(() => []),
  ]);
  const ids = [...new Set([...vec.map((r) => r.id), ...text.map((h) => h.artwork_id)])];
  out.queries[q.id] = {
    vec: vec.map((r) => ({ id: r.id, d: r.distance })),
    text: text.map((h) => ({ id: h.artwork_id, r: h.rank })),
    meta: await meta(ids),
  };
  console.log(q.id, "vec", vec.length, "text", text.length);
}
fs.writeFileSync(new URL("./legs.json", import.meta.url), JSON.stringify(out, null, 1));
console.log("wrote eval/legs.json");
