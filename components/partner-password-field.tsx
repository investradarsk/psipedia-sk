"use client";

import { useId, useState, type ChangeEventHandler } from "react";

type Props = {
  label: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
};

export function PartnerPasswordField({
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  maxLength,
  required = false,
  disabled = false,
  hint,
}: Props) {
  const inputId = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div className="partner-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="partner-password-control">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          minLength={minLength}
          maxLength={maxLength}
          required={required}
          disabled={disabled}
        />
        <button
          className="partner-password-toggle"
          type="button"
          aria-label={visible ? "Skryť heslo" : "Zobraziť heslo"}
          aria-pressed={visible}
          aria-controls={inputId}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? "Skryť" : "Zobraziť"}
        </button>
      </div>
      {hint ? <span className="partner-password-requirement">{hint}</span> : null}
    </div>
  );
}
