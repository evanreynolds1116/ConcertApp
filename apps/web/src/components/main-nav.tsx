"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The main tabs (docs/spec.md): Log, Stats, Feed, People, Profile.
export function MainNav({ username }: { username: string }) {
  const pathname = usePathname();
  const me = `/u/${username}`;
  const links = [
    { href: "/", label: "Log", current: pathname === "/" || pathname.startsWith("/concerts") },
    { href: "/stats", label: "Stats", current: pathname.startsWith("/stats") },
    { href: "/feed", label: "Feed", current: pathname.startsWith("/feed") },
    {
      href: "/people",
      label: "People",
      current:
        pathname.startsWith("/people") || (pathname.startsWith("/u/") && !pathname.startsWith(me)),
    },
    {
      href: "/profile",
      label: "Profile",
      current: pathname === me || pathname.startsWith(`${me}/`) || pathname.startsWith("/settings"),
    },
  ];
  return (
    <ul className="grid grid-cols-5 sm:flex sm:items-center sm:gap-1">
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            aria-current={link.current ? "page" : undefined}
            className="flex h-10 items-center justify-center rounded-full px-3 text-sm font-semibold text-muted hover:text-foreground aria-[current=page]:text-foreground sm:h-9"
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
