import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": [
      "node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/**",
      "node_modules/onnxruntime-node/lib/**",
      "node_modules/@img/sharp-linux-arm64/**",
      "node_modules/@img/sharp-libvips-linux-arm64/**",
    ],
  },
  async rewrites() {
    return [{ source: "/.well-known/x402", destination: "/x402-declaration" }];
  },
};

export default nextConfig;
