"use client";

import type { ReactNode } from "react";
import styles from "./admin-inline-edit-controls.module.css";

/** Shared desktop row-edit affordances. Domain modules own their API and field
 * allowlist; this component never invents a generic write endpoint. */
export function AdminInlineRowActions({
  editing, busy = false, disabled = false, onEdit, onSave, onCancel, children,
}: {
  editing: boolean;
  busy?: boolean;
  disabled?: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return <span className={styles.actions}>
    {editing ? <>
      <button type="button" className={styles.save} disabled={busy || disabled} onClick={onSave}>
        {busy ? "Ukladám…" : "Uložiť"}
      </button>
      <button type="button" className={styles.cancel} disabled={busy} onClick={onCancel}>Zrušiť</button>
    </> : <>
      <button type="button" className={styles.edit} disabled={busy || disabled}
        onClick={onEdit}>Upraviť v tabuľke</button>
      {children}
    </>}
  </span>;
}

export function AdminInlineCellInput({
  label, value, onChange, disabled = false, maxLength = 180, required = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  maxLength?: number;
  required?: boolean;
}) {
  return <input className={styles.input} type="text" aria-label={label}
    value={value} maxLength={maxLength} required={required} disabled={disabled}
    onChange={event => onChange(event.target.value)} />;
}

export function AdminInlineCellSelect({
  label, value, onChange, options, disabled = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
}) {
  return <select className={styles.input} aria-label={label} value={value}
    disabled={disabled} onChange={event => onChange(event.target.value)}>
    {options.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
  </select>;
}
