"use client";

import { useState, useTransition } from "react";
import { follow, unfollow } from "@/app/(app)/social-actions";
import type { FollowStatus } from "@/lib/social";

type FollowButtonProps = {
  userId: string;
  name: string;
  status: FollowStatus;
  /** Called with the new status, e.g. to update a lock message. */
  onChange?: (status: FollowStatus) => void;
  size?: "sm" | "lg";
};

/**
 * Follow -> Requested (private account) or Following (public). Tapping Requested cancels the
 * request; tapping Following unfollows (as in the mockups).
 */
export function FollowButton({
  userId,
  name,
  status: initial,
  onChange,
  size = "sm",
}: FollowButtonProps) {
  const [status, setStatus] = useState<FollowStatus>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = status === "none" ? await follow(userId) : await unfollow(userId);
      if (result.status) {
        setStatus(result.status);
        onChange?.(result.status);
      }
      if (result.error) setError(result.error);
    });
  }

  const label =
    status === "accepted"
      ? { text: "Following", aria: `Following ${name}, tap to unfollow` }
      : status === "pending"
        ? { text: "Requested", aria: `Requested to follow ${name}, tap to cancel` }
        : { text: "Follow", aria: `Follow ${name}` };
  const look =
    status === "none"
      ? "bg-accent text-on-accent hover:bg-accent-hover"
      : "border border-surface-raised text-foreground hover:border-foreground";
  const box = size === "lg" ? "h-11 min-w-32 px-6" : "h-9 min-w-26 px-4 text-sm";

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-label={label.aria}
        className={`shrink-0 rounded-full font-bold transition-colors disabled:opacity-60 ${box} ${look}`}
      >
        {label.text}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
