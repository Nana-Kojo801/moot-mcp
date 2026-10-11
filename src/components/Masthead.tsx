"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Chamber" },
  { href: "/statutes", label: "Statutes" },
  { href: "/house", label: "House" },
];

export function Masthead() {
  const path = usePathname();
  return (
    <header className="masthead">
      <Link href="/" className="wordmark">
        Moot
      </Link>
      <nav className="nav" aria-label="Main">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
