import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",   // generate static files in /out for Render Static Site
  trailingSlash: true, // ensures /reports → /reports/index.html resolves correctly
};

export default nextConfig;
