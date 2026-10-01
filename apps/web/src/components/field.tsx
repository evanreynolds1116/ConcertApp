type FieldProps = {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  errors?: string[];
  hint?: string;
};

/** Labelled input with its hint and validation message wired up for screen readers. */
export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  defaultValue,
  errors,
  hint,
}: FieldProps) {
  const hasError = Boolean(errors?.length);
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const describedBy = [hint ? hintId : "", hasError ? errorId : ""].filter(Boolean).join(" ");
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy || undefined}
        className="h-12 rounded-xl border border-border bg-surface px-4 text-base text-foreground outline-none focus:border-accent aria-invalid:border-danger"
      />
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {hasError && (
        <p id={errorId} className="text-sm text-danger">
          {errors?.[0]}
        </p>
      )}
    </div>
  );
}
