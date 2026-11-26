import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Les fichiers audio et vidéo peuvent être lourds.
  experimental: {
    serverActions: { bodySizeLimit: "500mb" },
  },
};

export default nextConfig;
