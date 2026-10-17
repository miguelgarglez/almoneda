// A paying HTTP client: POST /v1/search/image → 402 → sign on Stellar
// testnet → settle → results. Usage: node scripts/http-buyer.mjs [base_url] [image_url]
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
const IMAGE_URL =
  process.argv[3] ||
  "https://images.metmuseum.org/CRDImages/ep/web-large/DP145897.jpg";

const post = async (pathName, body, headers = {}) => {
  const r = await fetch(`${BASE}${pathName}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, headers: r.headers, json: await r.json().catch(() => null) };
};

const signer = await createEd25519Signer(process.env.X402_TEST_BUYER_STELLAR, "stellar:testnet");
const scheme = new ExactStellarScheme(signer);
console.log("buyer:", signer.address);

const first = await post("/v1/search/image", { image_url: IMAGE_URL });
if (first.status !== 402) {
  console.error("expected 402, got", first.status, JSON.stringify(first.json).slice(0, 400));
  process.exit(1);
}
const pr = JSON.parse(Buffer.from(first.headers.get("payment-required"), "base64").toString());
console.log("402 received —", pr.accepts.length, "accepts");
const stellar = pr.accepts.find((a) => a.network === "stellar:testnet");
const paid = await scheme.createPaymentPayload(2, stellar);
const signature = Buffer.from(
  JSON.stringify({ x402Version: 2, resource: pr.resource, accepted: stellar, ...paid }),
).toString("base64");

const second = await post("/v1/search/image", { image_url: IMAGE_URL }, { "payment-signature": signature });
if (second.status !== 200) {
  console.error("paid call failed:", second.status, JSON.stringify(second.json).slice(0, 600));
  process.exit(1);
}
const settle = second.headers.get("payment-response");
console.log("settlement:", settle ? JSON.parse(Buffer.from(settle, "base64").toString()).transaction : "(none)");
console.log("works:", second.json.results.map((w) => `${w.id} — ${w.title} (${w.provenance?.rights ?? "?"})`).join("\n  "));
