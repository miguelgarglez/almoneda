// A paying HTTP client for text search: GET /v1/search?q=... → 402 → sign on
// Stellar testnet → settle → results. Usage: node scripts/http-buyer-text.mjs [base_url] [query]
import fs from "node:fs";
import path from "node:path";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";

const envFile = path.join(process.env.HOME, ".config/lab/secrets.env");
for (const l of (fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
}
const BASE = process.argv[2] || "http://localhost:3000";
const Q = process.argv[3] || "storm at sea";
const STRICT = process.argv.includes("--strict") ? "&strict=1" : "";

const get = async (pathName, headers = {}) => {
  const r = await fetch(`${BASE}${pathName}`, { headers });
  return { status: r.status, headers: r.headers, json: await r.json().catch(() => null) };
};

const signer = await createEd25519Signer(process.env.X402_TEST_BUYER_STELLAR, "stellar:testnet");
const scheme = new ExactStellarScheme(signer);
console.log("buyer:", signer.address);

const first = await get(`/v1/search?q=${encodeURIComponent(Q)}&n=3${STRICT}`);
if (first.status !== 402) {
  console.error("expected 402, got", first.status, JSON.stringify(first.json).slice(0, 400));
  process.exit(1);
}
const pr = JSON.parse(Buffer.from(first.headers.get("payment-required"), "base64").toString());
console.log("402 received —", pr.accepts.length, "accepts:", pr.accepts.map((a) => a.network).join(", "));
const stellar = pr.accepts.find((a) => a.network === "stellar:testnet");
if (!stellar) { console.error("no stellar accept"); process.exit(1); }
const paid = await scheme.createPaymentPayload(2, stellar);
const signature = Buffer.from(
  JSON.stringify({ x402Version: 2, resource: pr.resource, accepted: stellar, ...paid }),
).toString("base64");

const second = await get(`/v1/search?q=${encodeURIComponent(Q)}&n=3${STRICT}`, { "payment-signature": signature });
if (second.status !== 200) {
  const settleH = second.headers.get("payment-response");
  console.log("paid call:", second.status, JSON.stringify(second.json).slice(0, 400));
  console.log("charged:", settleH ? "YES — settlement returned" : "no (no payment-response header)");
  process.exit(0);
}
const settle = second.headers.get("payment-response");
console.log("settlement tx:", settle ? JSON.parse(Buffer.from(settle, "base64").toString()).transaction : "(none)");
for (const w of second.json.results)
  console.log(` ${w.id} rel=${w.match?.relevance} — ${w.title} (${w.artist || "?"})`);
