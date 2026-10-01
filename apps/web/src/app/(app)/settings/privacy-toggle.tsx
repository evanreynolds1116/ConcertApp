"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setPrivacy } from "./actions";

export function PrivacyToggle({ isPrivate }: { isPrivate: boolean }) {
  const [optimisticPrivate, setOptimisticPrivate] = useOptimistic(isPrivate);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  function toggle() {
    const next = !optimisticPrivate;
    setError(undefined);
    startTransition(async () => {
      setOptimisticPrivate(next);
      const result = await setPrivacy(next);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p id="private-label" className="font-semibold">
            Private account
          </p>
          <p id="private-description" className="mt-1 text-sm text-muted">
            {optimisticPrivate
              ? "Only followers you approve can see your concerts, stats and activity. Switching to public approves any pending follow requests."
              : "Anyone signed in can see your concerts, stats and activity. Switching to private keeps your current followers."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={optimisticPrivate}
          aria-labelledby="private-label"
          aria-describedby="private-description"
          onClick={toggle}
          disabled={pending}
          className="relative h-7 w-12 shrink-0 rounded-full bg-surface-raised transition-colors aria-checked:bg-accent disabled:opacity-60"
        >
          <span
            aria-hidden
            className={`absolute top-1 left-1 size-5 rounded-full bg-foreground transition-transform ${
              optimisticPrivate ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
