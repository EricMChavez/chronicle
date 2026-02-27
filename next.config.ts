import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@lingo-reader/epub-parser"],
};

export default nextConfig;
