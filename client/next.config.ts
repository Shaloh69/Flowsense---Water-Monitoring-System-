import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone", // self-contained server bundle for Render / Docker deployments
};

export default nextConfig;
