// Copy base fields from mellizo.artworks into almoneda.artwork_meta.
// Keyset-paginated (id > cursor), resumable, safe to re-run after a swap:
// inserts ignore duplicates so existing tags survive.
// usage: node scripts/backfill-meta.mjs [startAfterId]
import fs from "node:fs";
import path from "node:path";

const envFile = path.join(process.env.HOME, ".config/lab/secrets.env");
for (const l of (fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
}
const URL_ = process.env.SUPABASE_LAB_URL, ANON = process.env.SUPABASE_LAB_ANON_KEY, SVC = process.env.SUPABASE_LAB_SERVICE_KEY;
const PAGE = 1000;
let cursor = process.argv[2] || "";
let copied = 0, tries = 0;

for (;;) {
  const res = await fetch(`${URL_}/rest/v1/artworks?select=id,source,title,artist,date,medium,department,pictorial&id=gt.${encodeURIComponent(cursor)}&order=id&limit=${PAGE}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Accept-Profile": "mellizo" },
  });
  if (!res.ok) {
    if (++tries > 8) { console.error(`read failed after retries at cursor=${cursor}: ${res.status}`); process.exit(1); }
    console.log(`read ${res.status} at cursor=${cursor}, retry ${tries}`);
    await new Promise((r) => setTimeout(r, 4000 * tries));
    continue;
  }
  tries = 0;
  const rows = await res.json();
  if (!rows.length) break;
  const up = rows.map((r) => ({
    artwork_id: r.id, source: r.source ?? "", title: r.title ?? "", artist: r.artist ?? "",
    date_text: r.date ?? "", medium: r.medium ?? "", department: r.department ?? "", pictorial: r.pictorial !== false,
  }));
  const wr = await fetch(`${URL_}/rest/v1/artwork_meta`, {
    method: "POST",
    headers: {
      apikey: SVC, Authorization: `Bearer ${SVC}`,
      "Content-Type": "application/json", "Content-Profile": "almoneda",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(up),
  });
  if (!wr.ok) { console.error(`write failed at cursor=${cursor}: ${wr.status} ${(await wr.text()).slice(0, 300)}`); process.exit(1); }
  copied += rows.length;
  cursor = rows[rows.length - 1].id;
  if (copied % 5000 === 0 || rows.length < PAGE) console.log(`copied=${copied} cursor=${cursor}`);
  if (rows.length < PAGE) break;
}
console.log(`done copied=${copied}`);
