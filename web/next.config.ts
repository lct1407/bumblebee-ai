import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",        // enable Dockerfile standalone build
  reactStrictMode: true,
};

export default nextConfig;
