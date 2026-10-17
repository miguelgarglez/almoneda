// Label every (query, candidate) pair 0-2 with a vision model from a family
// different from the builder's (google/gemini-2.5-flash via Vercel AI Gateway;
// the builder is Devin SWE and the round's outside judge is Codex/OpenAI).
// usage: npx tsx eval/judge.mjs [--only-missing]
import fs from "node:fs";
import path from "node:path";

const envFile = path.join(process.env.HOME, ".config/lab/secrets.env");
for (const l of (fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
}
const KEY = process.env.AI_GATEWAY_API_KEY;
const MODEL = process.env.EVAL_JUDGE_MODEL || "openai/gpt-4o-mini";

const POOL = JSON.parse(fs.readFileSync(new URL("./pool.json", import.meta.url), "utf8"));
const LABELS_PATH = new URL("./labels.json", import.meta.url).pathname;
const THUMBS = new URL("./thumbs/", import.meta.url).pathname;
const labels = fs.existsSync(LABELS_PATH) ? JSON.parse(fs.readFileSync(LABELS_PATH)) : {};

async function judgeOne(q, file) {
  const img = fs.readFileSync(file).toString("base64");
  const body = {
    model: MODEL,
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `An AI agent searched a public-domain artwork catalog for: "${q}". Judge whether this artwork is a good visual result.\n0 = irrelevant or misleading. 1 = partially relevant (right broad area, misses the point). 2 = clearly relevant — an agent could use it for that request.\nJudge the image itself, not the title. Reply JSON only: {"score":0|1|2,"why":"<10 words max>"}` },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } },
        ],
      },
    ],
  };
  const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  const text = (await res.json()).choices?.[0]?.message?.content ?? "";
  const m = text.match(/\{[^{}]*"score"[^{}]*\}/s) ?? text.match(/"score"\s*:\s*(\d)/);
  if (!m) return { score: -1, why: "unparsed: " + text.slice(0, 60) };
  if (m.length > 1 && m[1] != null) return { score: parseInt(m[1], 10), why: "" };
  try {
    const j = JSON.parse(m[0]);
    return { score: j.score, why: String(j.why ?? "").slice(0, 120) };
  } catch {
    const s = m[0].match(/"score"\s*:\s*(\d)/);
    return s ? { score: parseInt(s[1], 10), why: "" } : { score: -1, why: "unparsed: " + text.slice(0, 60) };
  }
}

let done = 0, skipped = 0, failed = 0;
const tasks = [];
for (const [qid, { q, candidates }] of Object.entries(POOL)) {
  labels[qid] ??= {};
  for (const c of candidates) {
    if (labels[qid][c.id] != null && labels[qid][c.id].score >= 0) { skipped++; continue; }
    const f = path.join(THUMBS, `${c.id}.jpg`);
    if (!fs.existsSync(f)) { labels[qid][c.id] = { score: -1, why: "no thumb" }; continue; }
    tasks.push({ qid, id: c.id, q, f });
  }
}
console.log(`${tasks.length} to judge, ${skipped} cached`);

const CONC = 12;
for (let i = 0; i < tasks.length; i += CONC) {
  await Promise.all(
    tasks.slice(i, i + CONC).map(async (t) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          labels[t.qid][t.id] = await judgeOne(t.q, t.f);
          done++;
          return;
        } catch (e) {
          if (attempt === 2) { labels[t.qid][t.id] = { score: -1, why: "error" }; failed++; }
          else await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
    })
  );
  if (done % 120 < CONC) { fs.writeFileSync(LABELS_PATH, JSON.stringify(labels, null, 1)); console.log(`${done}/${tasks.length}`); }
}
fs.writeFileSync(LABELS_PATH, JSON.stringify(labels, null, 1));
console.log(`done=${done} skipped=${skipped} failed=${failed} -> ${LABELS_PATH}`);
