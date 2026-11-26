import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import { RegisterSW } from "@/components/RegisterSW";
import { hasClaude, hasDeepgram } from "@/lib/config";

export const metadata: Metadata = {
  title: "Le rédacteur",
  description: "Enregistre, transcrit et transforme tes contenus en notes claires.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1e7" },
    { media: "(prefers-color-scheme: dark)", color: "#17150f" },
  ],
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const missing = [!hasDeepgram() && "Deepgram", !hasClaude() && "Anthropic"].filter(Boolean);
  return (
    <html lang="fr">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">
              <Logo />
              <span className="brand-name">
                Le <em>rédacteur</em>
              </span>
            </Link>
            <Nav />
          </div>
        </header>
        {missing.length > 0 && (
          <div className="demo-banner">
            Mode démo : les transcriptions et les notes sont des exemples. Ajoute {missing.length > 1 ? "tes clés" : "ta clé"}{" "}
            {missing.join(" et ")}{" "}
            dans les <Link href="/reglages">Réglages</Link> pour activer la vraie IA.
          </div>
        )}
        <main className="shell">{children}</main>
        <RegisterSW />
      </body>
    </html>
  );
}
