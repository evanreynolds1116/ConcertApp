import { formatCityState } from "@musicjunkie/shared";

// Phase 0 placeholder. Real screens start in Phase 1.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 font-sans">
      <h1 className="text-4xl font-bold text-accent">Music Junkie</h1>
      <p className="text-foreground/70">Log the concerts you&apos;ve been to.</p>
      <p className="text-sm text-foreground/50">
        Shared package check: {formatCityState("Nashville", "tn")}
      </p>
    </main>
  );
}
