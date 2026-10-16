import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/.well-known/x402", destination: "/x402-declaration" }];
  },
};

export default nextConfig;
