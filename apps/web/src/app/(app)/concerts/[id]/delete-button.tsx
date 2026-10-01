"use client";

import { useRef, useState, useTransition } from "react";
import { deleteConcert } from "./actions";

/** Delete with a confirm dialog (a native <dialog>: focus trapping and Escape for free). */
export function DeleteButton({ logId, title }: { logId: string; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [deleting, startDeleting] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmDelete() {
    setError(null);
    startDeleting(async () => {
      // On success the action redirects to the log.
      const result = await deleteConcert(logId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-surface-raised font-bold text-danger hover:border-danger"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden
          className="fill-none stroke-current stroke-2"
        >
          <path
            d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Delete
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="delete-title"
        className="m-auto w-[min(24rem,calc(100%-2rem))] rounded-2xl bg-surface p-6 text-foreground backdrop:bg-black/70"
      >
        <h2 id="delete-title" className="text-xl font-extrabold">
          Delete this concert?
        </h2>
        <p className="mt-2 text-muted">
          {title} will be removed from your log, stats and feed. This can&apos;t be undone.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            disabled={deleting}
            className="h-11 flex-1 rounded-full border border-surface-raised font-bold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleting}
            className="h-11 flex-1 rounded-full bg-danger font-bold text-background disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </dialog>
    </>
  );
}
