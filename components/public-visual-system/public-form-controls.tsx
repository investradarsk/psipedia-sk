import type { ComponentPropsWithRef, InputHTMLAttributes, ReactNode } from "react";
import styles from "./public-form-controls.module.css";

/** Context controls retain their approved page selectors and centrally defined filter tokens.
 * Do not add default form geometry here: search entries and compact filters have
 * intentionally different variants. Native attributes/ref/event handlers pass through.
 */
type PublicControlAppearance = { appearance?: "default" | "context" };

function classes(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

/** A native label that keeps its input/select/textarea inside the same accessible control. */
export function PublicFormField({
  label,
  hint,
  invalid = false,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  invalid?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label
      className={classes(styles.field, invalid && styles.invalid, className)}
      data-public-form-field
    >
      <span className={styles.label}>{label}</span>
      {children}
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  );
}

export function PublicTextInput({
  className,
  type = "text",
  appearance = "default",
  ...props
}: ComponentPropsWithRef<"input"> & PublicControlAppearance) {
  return (
    <input
      {...props}
      type={type}
      className={classes(appearance === "default" && styles.control, className)}
      data-public-form-control="input"
    />
  );
}

export function PublicSelect({
  className,
  children,
  appearance = "default",
  ...props
}: ComponentPropsWithRef<"select"> & PublicControlAppearance) {
  return (
    <select
      {...props}
      className={classes(
        appearance === "default" && styles.control,
        appearance === "default" && styles.select,
        className,
      )}
      data-public-form-control="select"
    >
      {children}
    </select>
  );
}

export function PublicTextarea({
  className,
  appearance = "default",
  ...props
}: ComponentPropsWithRef<"textarea"> & PublicControlAppearance) {
  return (
    <textarea
      {...props}
      className={classes(
        appearance === "default" && styles.control,
        appearance === "default" && styles.textarea,
        className,
      )}
      data-public-form-control="textarea"
    />
  );
}

/** Keep radio and checkbox semantics native: browser focus, keyboard and GET-form behavior. */
export function PublicChoice({
  label,
  type = "checkbox",
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  type?: "checkbox" | "radio";
}) {
  return (
    <label className={classes(styles.choice, className)} data-public-form-choice={type}>
      <PublicChoiceInput {...props} type={type} />
      <span>{label}</span>
    </label>
  );
}

/** Native choice for existing label compositions, including icons and status dots. */
export function PublicChoiceInput({
  type = "checkbox",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { type?: "checkbox" | "radio" }) {
  return <input {...props} type={type} data-public-form-control="choice" />;
}
