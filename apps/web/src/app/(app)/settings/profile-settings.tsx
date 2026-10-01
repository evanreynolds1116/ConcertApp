"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { Avatar } from "@/components/social/avatar";
import { getBrowserClient } from "@/lib/supabase/client";
import { deleteAccount, setAvatar, updateProfile } from "./actions";

/** Username and display name. */
export function ProfileForm({ username, displayName }: { username: string; displayName: string }) {
  const [state, action, pending] = useActionState(updateProfile, undefined);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field
        label="Username"
        name="username"
        autoComplete="username"
        hint="3–30 letters, numbers or underscores."
        defaultValue={state?.values?.username ?? username}
        errors={state?.fieldErrors?.username}
      />
      <Field
        label="Display name"
        name="displayName"
        autoComplete="name"
        defaultValue={state?.values?.displayName ?? displayName}
        errors={state?.fieldErrors?.displayName}
      />
      <p role="status" className="min-h-5 text-sm">
        {state?.error && <span className="text-danger">{state.error}</span>}
        {state?.saved && <span className="text-accent">Saved.</span>}
      </p>
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save profile
      </SubmitButton>
    </form>
  );
}

const AVATAR_SIZE = 256;

/** Center-crop and shrink an image to a 256px square WebP in the browser. */
async function toAvatarBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/webp", 0.85),
  );
}

/** Upload, replace or remove your photo. */
export function AvatarEditor({
  userId,
  name,
  src,
  hasAvatar,
}: {
  userId: string;
  name: string;
  src: string | null;
  hasAvatar: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, startBusy] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Pick an image file (JPEG, PNG or WebP).");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("That image is too large (15 MB max).");
      return;
    }
    startBusy(async () => {
      try {
        const blob = await toAvatarBlob(file);
        const path = `${userId}/${crypto.randomUUID()}.webp`;
        const { error: uploadError } = await getBrowserClient()
          .storage.from("avatars")
          .upload(path, blob, { contentType: "image/webp" });
        if (uploadError) throw uploadError;
        const result = await setAvatar(path);
        if (result.error) setError(result.error);
        else router.refresh();
      } catch {
        setError("Couldn't upload that image. Please try another.");
      } finally {
        if (input.current) input.current.value = "";
      }
    });
  }

  function remove() {
    setError(null);
    startBusy(async () => {
      const result = await setAvatar(null);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar userId={userId} name={name} src={src} size={72} />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <label
            className={`flex h-10 cursor-pointer items-center rounded-full border border-surface-raised px-4 text-sm font-bold focus-within:outline-2 focus-within:outline-accent hover:border-foreground ${busy ? "pointer-events-none opacity-60" : ""}`}
          >
            {busy ? "Saving…" : hasAvatar ? "Change photo" : "Upload photo"}
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
          {hasAvatar && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="h-10 rounded-full px-3 text-sm font-semibold text-muted hover:text-foreground disabled:opacity-60"
            >
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-subtle">Only people signed in to Music Junkie can see it.</p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/** Delete account, confirmed by typing your username. */
export function DeleteAccount({ username }: { username: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, startDeleting] = useTransition();
  const matches = typed.trim().toLowerCase() === username.toLowerCase();

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="h-12 w-full rounded-full border border-surface-raised font-bold text-danger hover:border-danger"
      >
        Delete account
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="delete-account-title"
        className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-2xl bg-surface p-6 text-foreground backdrop:bg-black/70"
      >
        <h2 id="delete-account-title" className="text-xl font-extrabold">
          Delete your account?
        </h2>
        <p className="mt-2 text-muted">
          This permanently deletes your profile, every concert you&apos;ve logged, your follows and
          your activity. It can&apos;t be undone.
        </p>
        <label htmlFor="confirm-username" className="mt-4 block text-sm font-semibold">
          Type <span className="font-bold">{username}</span> to confirm
        </label>
        <input
          id="confirm-username"
          type="text"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="mt-1.5 h-11 w-full rounded-lg border border-surface-raised bg-background px-3 outline-none focus:border-danger"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
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
            disabled={!matches || deleting}
            onClick={() =>
              startDeleting(async () => {
                const result = await deleteAccount(typed);
                if (result?.error) setError(result.error);
              })
            }
            className="h-11 flex-1 rounded-full bg-danger font-bold text-background disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Delete forever"}
          </button>
        </div>
      </dialog>
    </>
  );
}
