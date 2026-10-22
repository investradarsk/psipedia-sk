import { env } from "cloudflare:workers";
import { hasGeminiCanonicalOrigin, type GeminiNativeAgenda } from "@/lib/gemini-native-editor-origin";
import styles from "./admin-gemini-origin-badge.module.css";

/** Read-only origin marker in the normal admin editor, including published records. */
export async function AdminGeminiOriginBadge({ agenda, entityId }: {
  agenda: GeminiNativeAgenda;
  entityId: number;
}) {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) return null;
  try {
    if (!await hasGeminiCanonicalOrigin(db, agenda, entityId)) return null;
  } catch {
    // A missing provenance table must not prevent normal editorial work.
    return null;
  }
  return <div className={styles.container}><span className={styles.badge}>
    <span aria-hidden="true">✦</span> Vytvorené cez Gemini
  </span></div>;
}
