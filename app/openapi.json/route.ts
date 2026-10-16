import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const art = {
  type: "object",
  properties: {
    id: { type: "string", example: "met-435962" },
    title: { type: "string" },
    artist: { type: "string" },
    date: { type: "string" },
    medium: { type: "string" },
    department: { type: "string" },
    image: {
      type: "object",
      properties: {
        display: { type: "string", format: "uri" },
        thumb: { type: "string", format: "uri" },
        width: { type: ["integer", "null"] },
        height: { type: ["integer", "null"] },
      },
    },
    match: { type: "object", properties: { distance: { type: "number" } } },
    provenance: {
      type: "object",
      properties: {
        museum: { type: "string" },
        accession: { type: ["string", "null"] },
        rights: { type: "string", example: "CC0 1.0" },
        rights_url: { type: "string", format: "uri" },
        verified: { type: "boolean" },
        evidence_url: { type: "string", format: "uri" },
      },
    },
  },
};

export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "almoneda",
      version: "1.0.0",
      description:
        "Public-domain artworks for paying agents. Paid endpoints charge per call via x402 (HTTP 402): USDC on Base Sepolia or XLM on Stellar testnet. Every artwork returns machine-readable provenance and license proof. Testnet only.",
      "x-payment-info": {
        protocol: "x402", version: 2, facilitator: "https://x402.org/facilitator",
        rails: [
          { scheme: "exact", network: "eip155:84532", asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", note: "USDC on Base Sepolia, EIP-3009, facilitator pays gas" },
          { scheme: "exact", network: "stellar:testnet", asset: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC", note: "native XLM SAC, fees sponsored, friendbot for funds" },
        ],
      },
    },
    servers: [{ url: origin }],
    paths: {
      "/v1/search": {
        get: {
          operationId: "searchArtworks",
          summary: "Search public-domain artworks by text ($0.01 USDC via x402)",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" } },
            { name: "n", in: "query", schema: { type: "integer", minimum: 1, maximum: 12, default: 5 } },
          ],
          responses: {
            "200": { description: "Matching artworks", content: { "application/json": { schema: { type: "object", properties: { query: { type: "string" }, results: { type: "array", items: art }, corpus: { type: "object" } } } } } },
            "402": { description: "Payment required (x402). See PAYMENT-REQUIRED header." },
            "400": { description: "Missing or invalid query" },
          },
        },
      },
      "/v1/search/image": {
        post: {
          operationId: "searchByImage",
          summary: "Find artworks similar to an image ($0.02 USDC via x402)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    image_url: { type: "string", format: "uri" },
                    image_base64: { type: "string" },
                    n: { type: "integer", minimum: 1, maximum: 12, default: 5 },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Matching artworks", content: { "application/json": { schema: { type: "object", properties: { results: { type: "array", items: art } } } } } },
            "402": { description: "Payment required (x402)" },
          },
        },
      },
      "/v1/status": {
        get: {
          operationId: "getStatus",
          summary: "Service status (free)",
          responses: { "200": { description: "Corpus size, recent sales, prices, facilitator health" } },
        },
      },
      "/v1/floor": {
        get: {
          operationId: "getFloor",
          summary: "The public sales ledger and current lot (free)",
          responses: { "200": { description: "Corpus size, total sales, recent settled sales with tx hashes, current featured lot" } },
        },
      },
      "/v1/demo/search": {
        get: {
          operationId: "demoSearch",
          summary: "Free demo search (5/day/IP, 3 results)",
          parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Matching artworks" }, "429": { description: "Demo quota exhausted" } },
        },
      },
      "/v1/demo/bid": {
        post: {
          operationId: "demoBid",
          summary: "Send a house agent to bid (3/day/IP, 60/day global)",
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { q: { type: "string" } } } } } },
          responses: { "200": { description: "Purchase transcript with tx hash" }, "429": { description: "Quota exhausted" }, "503": { description: "House buyer unfunded" } },
        },
      },
      "/mcp": {
        post: {
          operationId: "mcp",
          summary: "MCP Streamable HTTP endpoint (JSON-RPC). Paid tools: search_artworks, search_by_image.",
          responses: { "200": { description: "JSON-RPC response" } },
        },
      },
    },
    tags: [{ name: "paid" }, { name: "free" }],
  });
}
