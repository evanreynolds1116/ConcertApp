import Link from "next/link";
import { MainNav } from "@/components/main-nav";
import { requireViewer } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireViewer();
  return (
    <>
      <header className="border-b border-border">
        {/* Phones: logo + Add on one row, the five tabs below. Wider: all on one row. */}
        <nav
          aria-label="Main"
          className="mx-auto grid w-full max-w-3xl grid-cols-[auto_1fr] items-center gap-x-3 px-4 py-2 sm:flex sm:h-16 sm:py-0"
        >
          <Link href="/" className="text-xl font-extrabold text-accent sm:mr-2">
            Music Junkie
          </Link>
          <div className="col-span-2 row-start-2 sm:order-none sm:flex-1">
            <MainNav username={profile.username} />
          </div>
          <Link
            href="/add"
            className="col-start-2 row-start-1 flex h-9 items-center gap-1 justify-self-end rounded-full bg-accent px-3.5 text-sm font-bold whitespace-nowrap text-on-accent hover:bg-accent-hover"
          >
            <span aria-hidden className="text-lg leading-none">
              +
            </span>{" "}
            Add<span className="sr-only sm:not-sr-only">&nbsp;concert</span>
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
