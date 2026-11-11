"use client";

import { useState } from "react";
import styles from "./admin-record-id.module.css";
import { formatDisplayId, type DisplayIdKind } from "@/lib/admin-display-id";

/** Stable Admin/D1 ID, not an FCI number or a Notion page ID. */
export function AdminRecordId({ id, kind, category, compact = false }: { id: number; kind?: DisplayIdKind; category?: string | null; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const displayed = kind ? formatDisplayId(id, kind, category) : String(id);
  return (
    <button
      type="button"
      className={compact ? styles.compact : styles.recordId}
      aria-label={"Kopírovať Psipedia ID " + displayed}
      title={"Kopírovať Psipedia ID #" + displayed}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(displayed);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      <span>ID #{displayed}</span>
      <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
    </button>
  );
}

