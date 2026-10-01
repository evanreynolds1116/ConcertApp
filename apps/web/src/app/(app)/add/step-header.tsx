import Link from "next/link";

type StepHeaderProps = {
  step: 1 | 2 | 3;
  title: string;
  /** Step 1 cancels back to the log; later steps go back a step. */
  onBack?: () => void;
};

export function StepHeader({ step, title, onBack }: StepHeaderProps) {
  return (
    <div>
      <div className="flex min-h-11 items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 flex min-h-11 items-center gap-0.5 pr-3 font-semibold"
          >
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              aria-hidden
              className="fill-none stroke-current stroke-2"
            >
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
        ) : (
          <Link href="/" className="flex min-h-11 items-center pr-3 font-semibold">
            Cancel
          </Link>
        )}
        <span className="text-sm font-semibold text-muted">Step {step} of 3</span>
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      <div className="mt-3 grid grid-cols-3 gap-1.5" aria-hidden>
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className={`h-1 rounded-sm ${n <= step ? "bg-accent" : "bg-surface-raised"}`}
          />
        ))}
      </div>
    </div>
  );
}
