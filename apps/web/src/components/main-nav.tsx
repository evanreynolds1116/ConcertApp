"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The main tabs (docs/spec.md): Log, Stats, Feed, People, Profile. Feed, People and Profile
// arrive with Phase 5.
const LINKS = [
  { href: "/", label: "Log", match: (p: string) => p === "/" || p.startsWith("/concerts") },
  { href: "/stats", label: "Stats", match: (p: string) => p.startsWith("/stats") },
];

export function MainNav() {
  const pathname = usePathname();
  return (
    <ul className="flex items-center gap-1">
      {LINKS.map((link) => {
        const current = link.match(pathname);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={current ? "page" : undefined}
              className="flex h-9 items-center rounded-full px-3 font-semibold text-muted hover:text-foreground aria-[current=page]:text-foreground"
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
