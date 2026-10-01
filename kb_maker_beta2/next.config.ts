import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // pdf-parse and tesseract.js use Node.js APIs not available in edge runtime.
  serverExternalPackages: ["pdf-parse", "tesseract.js"],

  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
