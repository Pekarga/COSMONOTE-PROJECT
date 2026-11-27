import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DropGuard } from "@/components/DropGuard";
import { RegisterSW } from "@/components/RegisterSW";
import { Shell } from "@/components/Shell";
import { hasClaude } from "@/lib/config";
import { getSetting } from "@/lib/db";

export const metadata: Metadata = {
  title: "Rédacteur de Courriers Administratifs",
  description: "Rédigez vos courriers administratifs et vos notes au Directeur dans le style de vos courriers signés.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#ef7d00" };

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Shell nom={getSetting("nom") ?? ""} fonction={getSetting("fonction") ?? ""} demo={!hasClaude()}>
          {children}
        </Shell>
        <DropGuard />
        <RegisterSW />
      </body>
    </html>
  );
}
