// A paying MCP client: initialize → tools/list → tools/call → 402 →
// sign on Stellar testnet → retry with _meta["x402/payment"] → results.
// Usage: node scripts/mcp-buyer.mjs [base_url] [query]
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
const QUERY = process.argv[3] || "a winter landscape";

const rpc = async (method, params) => {
  const r = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return r.json();
};

const signer = await createEd25519Signer(process.env.X402_TEST_BUYER_STELLAR, "stellar:testnet");
const scheme = new ExactStellarScheme(signer);
console.log("buyer:", signer.address);

await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcp-buyer", version: "0.1" } });
const first = await rpc("tools/call", { name: "search_artworks", arguments: { query: QUERY, n: 3 } });
if (first.error?.code !== 402) { console.error("expected 402, got:", JSON.stringify(first).slice(0, 400)); process.exit(1); }
const req = first.error.data;
console.log("402 received —", req.accepts.length, "accepts");
const stellar = req.accepts.find((a) => a.network === "stellar:testnet");
const paid = await scheme.createPaymentPayload(2, stellar);
const payment = { x402Version: 2, resource: req.resource, accepted: stellar, ...paid };

const second = await rpc("tools/call", {
  name: "search_artworks",
  arguments: { query: QUERY, n: 3 },
  _meta: { "x402/payment": payment },
});
if (second.error) { console.error("paid call failed:", JSON.stringify(second.error).slice(0, 600)); process.exit(1); }
const settle = second.result?._meta?.["x402/payment-response"] ?? second.result?.paymentResponse ?? null;
const works = JSON.parse(second.result.content[0].text);
console.log("settlement:", JSON.stringify(settle));
console.log("works:", works.results.map((w) => `${w.id} — ${w.title} (${w.provenance?.rights ?? "?"})`).join("\n  "));
