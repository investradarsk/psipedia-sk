"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import styles from "./admin-record-id.module.css";

/** Stable Admin/D1 ID, not an FCI number or a Notion page ID. */
export function AdminRecordId({ id, compact = false }: { id: number; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return (
    <button
      type="button"
      className={compact ? styles.compact : styles.recordId}
      aria-label={"Kopírovať Admin ID " + id}
      title={"Kopírovať Admin ID #" + id}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(String(id));
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      <span>ID #{id}</span>
      <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
    </button>
  );
}

/** All editor routes get the same visible numeric identity beside their title. */
export function AdminCurrentRecordId() {
  const pathname = usePathname();
  const match = /^\/admin\/(?:plemena|adresar|podujatia|clanky|adopcie|organizacie|pomoc|stratene-najdene)\/([1-9]\d*)\/?$/.exec(pathname ?? "");
  if (!match) return null;
  const id = Number(match[1]);
  if (!Number.isSafeInteger(id)) return null;
  return <div className={styles.editorId}><AdminRecordId id={id} /></div>;
}
