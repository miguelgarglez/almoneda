import type { NextConfig } from "next";

const clipRoutes = [
  "/v1/search",
  "/v1/search/image",
  "/v1/demo/search",
  "/v1/demo/bid",
  "/mcp",
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: Object.fromEntries(
    clipRoutes.map((route) => [
      route,
      [
        "node_modules/onnxruntime-node/bin/napi-v3/linux/x64/**",
        "node_modules/onnxruntime-node/lib/**",
      ],
    ]),
  ),
  async rewrites() {
    return [{ source: "/.well-known/x402", destination: "/x402-declaration" }];
  },
};

export default nextConfig;
