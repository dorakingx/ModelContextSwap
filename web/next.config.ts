import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@coral-xyz/anchor", "@solana/web3.js"],
    externalDir: true
  },
  transpilePackages: ["dex-ai-sdk"]
};

export default nextConfig;
