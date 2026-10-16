// Backfill artwork_meta.tags from the museums' own bulk data, staged into
// almoneda.meta_tags (merge: scripts/tags-merge.sql). Resumable per source.
// usage: node scripts/tags-backfill.mjs cle|aic|nga|met [--limit N]
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createGzip } from "node:zlib";

const envFile = path.join(process.env.HOME, ".config/lab/secrets.env");
for (const l of (fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
}
const URL_ = process.env.SUPABASE_LAB_URL, ANON = process.env.SUPABASE_LAB_ANON_KEY, SVC = process.env.SUPABASE_LAB_SERVICE_KEY;
const SRC = process.argv[2];
const LIMIT = process.argv.includes("--limit") ? parseInt(process.argv[process.argv.indexOf("--limit") + 1], 10) : Infinity;

const STATE = path.join("/tmp", `almoneda-tags-${SRC}.state.json`);
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE)) : {};
const saveState = () => fs.writeFileSync(STATE, JSON.stringify(state));

// corpus ids for this source, loaded once from the artwork_meta mirror
// (already fully copied; avoids re-paging the churning corpus table)
async function corpusIds(source) {
  const out = new Set();
  let cursor = `${source}-`;
  for (;;) {
    const res = await fetch(`${URL_}/rest/v1/artwork_meta?select=artwork_id&source=eq.${source}&artwork_id=gt.${encodeURIComponent(cursor)}&order=artwork_id&limit=1000`, {
      headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Accept-Profile": "almoneda" },
    });
    if (!res.ok) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    const rows = await res.json();
    if (!rows.length) break;
    for (const r of rows) out.add(r.artwork_id);
    cursor = rows[rows.length - 1].artwork_id;
    if (rows.length < 1000) break;
  }
  return out;
}

let staged = 0;
async function stage(rows) {
  // rows: [{artwork_id, tags}] — dedupe on artwork_id: ON CONFLICT rejects
  // a batch that touches the same key twice
  const seen = new Map();
  for (const r of rows) seen.set(r.artwork_id, r);
  rows = [...seen.values()];
  for (let i = 0; i < rows.length; i += 400) {
    const batch = rows.slice(i, i + 400);
    const res = await fetch(`${URL_}/rest/v1/meta_tags`, {
      method: "POST",
      headers: {
        apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json",
        "Content-Profile": "almoneda", Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) { console.error(`stage failed: ${res.status} ${(await res.text()).slice(0, 200)}`); process.exit(1); }
    staged += batch.length;
  }
}

const clean = (s) => String(s ?? "").replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
const clipStr = (s, n = 400) => clean(s).slice(0, n);

async function backfillCle() {
  const wanted = await corpusIds("cle");
  console.log(`cle corpus ids: ${wanted.size}`);
  let skip = state.skip ?? 0, rows = [];
  const fields = "id,artists_tags,culture,technique,type,description,alternate_titles,inscriptions";
  for (;;) {
    const res = await fetch(`https://openaccess-api.clevelandart.org/api/artworks?cc0=1&has_image=1&limit=100&skip=${skip}&fields=${fields}`);
    if (!res.ok) { console.error(`cle ${res.status} at ${skip}; retrying`); await new Promise((r) => setTimeout(r, 3000)); continue; }
    const j = await res.json();
    const data = j.data ?? [];
    if (!data.length) break;
    for (const d of data) {
      const cid = `cle-${d.id}`;
      if (!wanted.has(cid)) continue;
      const tags = [
        ...(d.artists_tags ?? []), ...(d.culture ?? []), ...(d.alternate_titles ?? []),
        d.technique, d.type, clipStr(d.description), clipStr(d.inscriptions, 200),
      ].filter(Boolean).map(clean).filter(Boolean).join(" ");
      if (tags) rows.push({ artwork_id: cid, tags });
    }
    skip += data.length;
    if (rows.length >= 2000) { await stage(rows.splice(0)); state.skip = skip; saveState(); console.log(`cle skip=${skip} staged=${staged}`); }
    if (skip >= LIMIT || skip >= (j.info?.total ?? Infinity)) break;
    await new Promise((r) => setTimeout(r, 120));
  }
  await stage(rows); state.skip = skip; saveState();
  console.log(`cle done staged=${staged}`);
}

async function backfillAic() {
  const wanted = [...(await corpusIds("aic"))].map((id) => id.slice(4));
  console.log(`aic corpus ids: ${wanted.length}`);
  const fields = "id,term_titles,subject_titles,style_titles,category_titles,classification_titles,material_titles,technique_titles";
  let rows = [];
  for (let i = 0; i < wanted.length; i += 60) {
    const ids = wanted.slice(i, i + 60);
    const res = await fetch(`https://api.artic.edu/api/v1/artworks?ids=${ids.join(",")}&fields=${fields}&limit=60`);
    if (!res.ok) { console.error(`aic ${res.status} at ${i}`); await new Promise((r) => setTimeout(r, 3000)); continue; }
    const j = await res.json();
    for (const d of j.data ?? []) {
      const tags = [...(d.term_titles ?? []), ...(d.subject_titles ?? []), ...(d.style_titles ?? []), ...(d.category_titles ?? []), ...(d.classification_titles ?? []), ...(d.material_titles ?? []), ...(d.technique_titles ?? [])].map(clean).filter(Boolean).join(" ");
      if (tags) rows.push({ artwork_id: `aic-${d.id}`, tags });
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  await stage(rows);
  console.log(`aic done staged=${staged}`);
}

// Minimal CSV row parser for the big museum dumps: quoted fields, embedded
// commas and newlines. Yields field arrays.
async function* csvRows(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let buf = "";
  for await (const line of rl) {
    buf = buf ? buf + "\n" + line : line;
    // an odd count of unescaped quotes means we're inside a quoted field
    let quotes = 0, inQ = false;
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (inQ && c === '"' && buf[i + 1] === '"') { i++; continue; }
      if (c === '"') { inQ = !inQ; quotes++; }
    }
    if (inQ) continue;
    // split respecting quotes
    const fields = [];
    let cur = "", q = false;
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (q && c === '"' && buf[i + 1] === '"') { cur += '"'; i++; continue; }
      if (c === '"') { q = !q; continue; }
      if (c === "," && !q) { fields.push(cur); cur = ""; continue; }
      cur += c;
    }
    fields.push(cur);
    yield fields;
    buf = "";
  }
}

async function backfillMet() {
  const wanted = await corpusIds("met");
  console.log(`met corpus ids: ${wanted.size}`);
  const file = "/tmp/MetObjects.csv";
  if (!fs.existsSync(file)) {
    console.log("downloading MetObjects.csv (~340MB)...");
    const res = await fetch("https://media.githubusercontent.com/media/metmuseum/openaccess/master/MetObjects.csv");
    if (!res.ok || !res.body) { console.error("met csv fetch failed", res.status); process.exit(1); }
    const w = fs.createWriteStream(file);
    const { Readable } = await import("node:stream");
    await new Promise((res2, rej) => { Readable.fromWeb(res.body).pipe(w).on("finish", res2).on("error", rej); });
    console.log("downloaded");
  }
  // columns: Object ID=4, Object Name=8, Title=9, Culture=10, Period=11,
  // Medium=31, Classification=44, Tags=50 (from the header we read)
  let rows = [], matched = 0, first = true;
  for await (const f of csvRows(file)) {
    if (first) { first = false; continue; }
    const oid = f[4];
    if (!oid || !wanted.has(`met-${oid}`)) continue;
    matched++;
    const tags = [f[8], f[10], f[11], f[44], f[50]].map(clean).filter(Boolean).join(" ");
    if (tags) rows.push({ artwork_id: `met-${oid}`, tags });
    if (rows.length >= 2000) { await stage(rows.splice(0)); console.log(`met matched=${matched} staged=${staged}`); }
    if (matched >= LIMIT) break;
  }
  await stage(rows);
  console.log(`met done matched=${matched} staged=${staged}`);
}

async function backfillNga() {
  const wanted = await corpusIds("nga");
  console.log(`nga corpus ids: ${wanted.size}`);
  // objects.csv: classification/subclassification/inscription per objectid
  const objFile = "/tmp/nga-objects.csv";
  const termFile = "/tmp/nga-terms.csv";
  for (const [f, u] of [
    [objFile, "https://raw.githubusercontent.com/NationalGalleryOfArt/opendata/main/data/objects.csv"],
    [termFile, "https://raw.githubusercontent.com/NationalGalleryOfArt/opendata/main/data/objects_terms.csv"],
  ]) {
    if (fs.existsSync(f)) continue;
    console.log(`downloading ${u}`);
    const res = await fetch(u);
    if (!res.ok || !res.body) { console.error("fetch failed", res.status); process.exit(1); }
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  const tags = new Map();
  const add = (id, t) => { if (!wanted.has(id) || !t) return; tags.set(id, (tags.get(id) ?? "") + " " + t); };
  // objects_terms.csv: termid,objectid,termtype,term,theme,style
  let first = true;
  for await (const f of csvRows(termFile)) {
    if (first) { first = false; continue; }
    add(`nga-${f[1]}`, clean(f[3]));
    add(`nga-${f[1]}`, clean(f[4]));
    add(`nga-${f[1]}`, clean(f[5]));
  }
  first = true;
  for await (const f of csvRows(objFile)) {
    if (first) { first = false; continue; }
    // objectid,..,inscription=12,markings=13,...,classification=18,subclass=19,vbclass=20
    add(`nga-${f[0]}`, clean(f[18]));
    add(`nga-${f[0]}`, clean(f[19]));
    add(`nga-${f[0]}`, clean(f[20]));
    add(`nga-${f[0]}`, clipStr(f[12], 200));
  }
  const rows = [...tags.entries()].map(([artwork_id, t]) => ({ artwork_id, tags: t.trim() }));
  await stage(rows);
  console.log(`nga done staged=${staged}`);
}

const fn = { cle: backfillCle, aic: backfillAic, nga: backfillNga, met: backfillMet }[SRC];
if (!fn) { console.error("usage: tags-backfill.mjs cle|aic|nga|met"); process.exit(1); }
await fn();
