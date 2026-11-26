"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GearIcon } from "./Icons";

export function Nav() {
  const path = usePathname();
  if (path === "/connexion") return null;
  const notesActive = path === "/" || path.startsWith("/notes") || path.startsWith("/scanner");
  return (
    <nav className="nav">
      <Link href="/" className={notesActive ? "active" : ""}>
        Notes
      </Link>
      <Link href="/assistant" className={path.startsWith("/assistant") ? "active" : ""}>
        Assistant
      </Link>
      <Link href="/reglages" className={`nav-icon ${path.startsWith("/reglages") ? "active" : ""}`} aria-label="Réglages">
        <GearIcon size={17} />
      </Link>
    </nav>
  );
}
