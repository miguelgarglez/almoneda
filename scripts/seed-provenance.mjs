// Seed almoneda.provenance for Met works from the Met's open-access CSV
// (their collection API is Incapsula-walled; the CSV is the same data).
// Usage: node scripts/seed-provenance.mjs [path-to-MetObjects.csv]
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const envFile = path.join(process.env.HOME, ".config/lab/secrets.env");
for (const l of (fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
}
const { SUPABASE_LAB_URL: URL_, SUPABASE_LAB_SERVICE_KEY: SVC, SUPABASE_LAB_ANON_KEY: ANON } = process.env;
const CSV = process.argv[2] || path.join(process.env.HOME, "Developer/mellizo/data/MetObjects.csv");

// 1. corpus ids
const ids = new Set();
{
  let offset = 0;
  for (;;) {
    const r = await fetch(`${URL_}/rest/v1/artworks?select=id&limit=1000&offset=${offset}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Accept-Profile": "mellizo" },
    });
    const rows = await r.json();
    for (const row of rows) if (row.id.startsWith("met-")) ids.add(row.id.split("-")[1]);
    if (rows.length < 1000) break;
    offset += 1000;
  }
}
console.log(`met corpus ids: ${ids.size}`);

// 2. scan the CSV once
const want = new Map();
const rl = readline.createInterface({ input: fs.createReadStream(CSV), crlfDelay: Infinity });
let header = null, iNum = 0, iPD = 3, iID = 4;
for await (const line of rl) {
  if (!header) {
    const cols = line.split(",").map((c) => c.replace(/^﻿/, ""));
    header = cols;
    iNum = cols.indexOf("Object Number");
    iPD = cols.indexOf("Is Public Domain");
    iID = cols.indexOf("Object ID");
    continue;
  }
  // the three columns we need (0,3,4) are early and never contain commas
  const cols = line.split(",");
  const oid = cols[iID]?.replace(/"/g, "");
  if (oid && ids.has(oid)) {
    want.set(oid, {
      accession: cols[iNum]?.replace(/"/g, "") || oid,
      pd: (cols[iPD] || "").replace(/"/g, "").toLowerCase() === "true",
    });
  }
}
console.log(`matched in CSV: ${want.size}`);

// 3. upsert in batches
const rows = [...want.entries()].map(([oid, w]) => ({
  artwork_id: `met-${oid}`,
  source: "met",
  accession: w.accession,
  rights: "CC0 1.0",
  rights_url: "https://creativecommons.org/publicdomain/zero/1.0/",
  verified: w.pd,
  evidence_url: `https://www.metmuseum.org/art/collection/search/${oid}`,
  fetched_at: new Date().toISOString(),
}));
for (let i = 0; i < rows.length; i += 500) {
  const batch = rows.slice(i, i + 500);
  const r = await fetch(`${URL_}/rest/v1/provenance`, {
    method: "POST",
    headers: {
      apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json",
      "Accept-Profile": "almoneda", "Content-Profile": "almoneda",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(batch),
  });
  if (!r.ok) { console.error(r.status, await r.text()); process.exit(1); }
  process.stdout.write(`\rupserted ${Math.min(i + 500, rows.length)}/${rows.length}`);
}
console.log("\ndone");
