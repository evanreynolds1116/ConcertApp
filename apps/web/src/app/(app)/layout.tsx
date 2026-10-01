import Link from "next/link";
import { requireViewer } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireViewer();
  return (
    <>
      <header className="border-b border-border">
        <nav
          aria-label="Main"
          className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4"
        >
          <Link href="/" className="text-xl font-extrabold text-accent">
            Music Junkie
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/add"
              className="flex h-9 items-center gap-1 rounded-full bg-accent px-3.5 font-bold text-on-accent hover:bg-accent-hover"
            >
              <span aria-hidden className="text-lg leading-none">
                +
              </span>{" "}
              Add concert
            </Link>
            <span className="hidden text-muted sm:inline">@{profile.username}</span>
            <Link href="/settings" className="font-semibold hover:text-accent">
              Settings
            </Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
