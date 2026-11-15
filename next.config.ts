import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.NODE_ENV === "production" ? "/fin-dash-wkkai" : "",
  assetPrefix: process.env.NODE_ENV === "production" ? "/fin-dash-wkkai/" : "",
  env: { NEXT_PUBLIC_BUILD: String(Date.now()) },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
