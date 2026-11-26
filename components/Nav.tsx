"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Mes notes" },
  { href: "/nouvelle", label: "Nouvelle note" },
  { href: "/assistant", label: "Assistant" },
  { href: "/reglages", label: "Réglages" },
];

export function Nav() {
  const path = usePathname();
  if (path === "/connexion") return null;
  return (
    <nav className="nav">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" || path.startsWith("/notes") : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : ""}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
