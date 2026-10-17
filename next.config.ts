import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": [
      "node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**",
      "node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**",
      "node_modules/onnxruntime-node/lib/**",
      "node_modules/@img/sharp-linux-arm64/**",
      "node_modules/@img/sharp-libvips-linux-arm64/**",
      "node_modules/@img/sharp-linux-x64/**",
      "node_modules/@img/sharp-libvips-linux-x64/**",
      "node_modules/@huggingface/transformers/node_modules/@img/sharp-linux-arm64/**",
      "node_modules/@huggingface/transformers/node_modules/@img/sharp-libvips-linux-arm64/**",
      "node_modules/@huggingface/transformers/node_modules/@img/sharp-linux-x64/**",
      "node_modules/@huggingface/transformers/node_modules/@img/sharp-libvips-linux-x64/**",
    ],
  },
  async rewrites() {
    return [
      { source: "/.well-known/x402", destination: "/x402-declaration" },
      { source: "/favicon.ico", destination: "/icon.svg" },
    ];
  },
};

export default nextConfig;
