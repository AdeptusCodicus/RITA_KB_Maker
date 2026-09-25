import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pdf-parse and tesseract.js use Node.js APIs not available in edge runtime.
  serverExternalPackages: ["pdf-parse", "tesseract.js"],

  // Next.js 16 uses Turbopack by default; empty config silences the webpack-only warning.
  turbopack: {},
};

export default nextConfig;
