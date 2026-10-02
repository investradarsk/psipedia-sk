import type { ReactNode } from "react";

export function SectionHeroSearch({
  action,
  id,
  label,
  placeholder,
  defaultValue = "",
  buttonLabel = "Hľadať",
  hidden = [],
  beforeInput,
}: {
  action: string;
  id: string;
  label: string;
  placeholder: string;
  defaultValue?: string;
  buttonLabel?: string;
  hidden?: Array<{ name: string; value: string }>;
  beforeInput?: ReactNode;
}) {
  return (
    <form action={action} method="get" role="search" aria-label={label} data-section-hero-search>
      {hidden.map((field) => <input type="hidden" name={field.name} value={field.value} key={field.name} />)}
      {beforeInput}
      <label htmlFor={id}>
        <span className="sr-only">{label}</span>
        <input id={id} name="q" defaultValue={defaultValue} maxLength={120} placeholder={placeholder} autoComplete="off" />
      </label>
      <button type="submit">{buttonLabel}</button>
    </form>
  );
}
