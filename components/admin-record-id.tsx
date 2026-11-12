"use client";

import { memo, useState } from "react";
import styles from "./admin-record-id.module.css";

/** Stable Admin/D1 ID, not an FCI number or a Notion page ID. */
export const AdminRecordId = memo(function AdminRecordId({ id, compact = false }: { id: number; compact?: boolean }) {
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
});

