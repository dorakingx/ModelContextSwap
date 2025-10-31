import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true
  },
  serverExternalPackages: ["@coral-xyz/anchor", "@solana/web3.js"],
  typescript: {
    ignoreBuildErrors: true
  }
};

export default nextConfig;
