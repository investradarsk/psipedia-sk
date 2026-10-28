"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import styles from "./portal-section-tabs.module.css";

type Item = { href: string; label: string; current?: boolean };

export function PortalMobileCategorySelect({
  items, sectionLabel,
}: {
  items: Item[];
  sectionLabel: string;
}) {
  const router = useRouter();
  const id = useId();
  const current = items.find((item) => item.current)?.href ?? items[0]?.href ?? "";
  return (
    <div className={styles.mobilePicker}>
      <label htmlFor={id}>Oblasť v sekcii {sectionLabel}</label>
      <select id={id} value={current} onChange={(event) => {
        if (event.target.value && event.target.value !== current) router.push(event.target.value);
      }}>
        {items.map((item) => (
          <option key={item.href} value={item.href}>{item.label}</option>
        ))}
      </select>
    </div>
  );
}
