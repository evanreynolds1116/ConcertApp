type SubmitButtonProps = { pending: boolean; pendingLabel: string; children: React.ReactNode };

export function SubmitButton({ pending, pendingLabel, children }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-12 rounded-full bg-accent px-6 font-bold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
