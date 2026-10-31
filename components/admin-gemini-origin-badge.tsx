import { env } from "cloudflare:workers";
import { hasGeminiCanonicalOrigin, type GeminiNativeAgenda } from "@/lib/gemini-native-editor-origin";
import { getGeminiImportReviewNotes } from "@/lib/gemini-import-review-notes";
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
  // Migration may not be applied during staggered deploys: notes are optional.
  const review = await getGeminiImportReviewNotes(db, agenda, entityId).catch(() => null);
  return <div className={styles.container}>
    <span className={styles.badge}><span aria-hidden="true">✦</span> Vytvorené cez Gemini</span>
    {review?.warnings.length ? <div className={styles.review} role="note">
      <strong>Na kontrolu – upozornenia neblokujú import</strong>
      <p>Profil je otvorený na úpravu. Chýbajúce údaje doplň pred zverejnením; originál zostáva v Notione.</p>
      <ul>{review.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
    </div> : null}
  </div>;
}
