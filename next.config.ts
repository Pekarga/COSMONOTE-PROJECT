import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produit un serveur autonome, embarqué dans l'appli de bureau (dossier desktop/).
  output: "standalone",
  // Les fichiers audio et vidéo peuvent être lourds.
  experimental: {
    serverActions: { bodySizeLimit: "500mb" },
  },
};

export default nextConfig;
