import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import styles from "./public-form-controls.module.css";

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
    <label className={classes(styles.field, invalid && styles.invalid, className)} data-public-form-field>
      <span className={styles.label}>{label}</span>
      {children}
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  );
}

export function PublicTextInput({ className, type = "text", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} type={type} className={classes(styles.control, className)} data-public-form-control="input" />;
}

export function PublicSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={classes(styles.control, styles.select, className)} data-public-form-control="select">
      {children}
    </select>
  );
}

export function PublicTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={classes(styles.control, styles.textarea, className)} data-public-form-control="textarea" />;
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
      <input {...props} type={type} />
      <span>{label}</span>
    </label>
  );
}
