import Link from "next/link";
import { getAdminContentViewSummary } from "@/lib/admin-content-view-summary";
import type { ContentAnalyticsEntityType } from "@/lib/content-analytics";
import styles from "./admin-record-view-stats.module.css";

const WINDOWS = [
  { key: "24h", label: "24 hodín" },
  { key: "7d", label: "7 dní" },
  { key: "30d", label: "30 dní" },
  { key: "all", label: "Celkovo" },
] as const;

const formatter = new Intl.NumberFormat("sk-SK");

/**
 * Server-only, read-only editor accessory. The authenticated parent route
 * has already checked requireAdminPageUser before rendering this component.
 * It never creates editable form state or sends writes back to the editor.
 */
export async function AdminRecordViewStats({
  entityType,
  entityId,
}: {
  entityType: ContentAnalyticsEntityType;
  entityId: number;
}) {
  const summary = await getAdminContentViewSummary({ entityType, entityId });
  const isArticle = entityType === "ARTICLE";

  return (
    <section
      className={styles.stats}
      aria-label={isArticle ? "Štatistiky prečítaní článku" : "Štatistiky návštev profilu"}
      data-admin-record-view-stats
      data-content-type={isArticle ? "article" : "profile"}
    >
      <div className={styles.heading}>
        <div>
          <h2>{isArticle ? "Prečítania článku" : "Návštevy profilu"}</h2>
          <p>Kvalifikované {isArticle ? "prečítania" : "zobrazenia"} · len na čítanie</p>
        </div>
        <Link prefetch={false} href="/admin/nastavenia/statistiky">
          Všetky štatistiky
        </Link>
      </div>
      {summary === null ? (
        <p className={styles.unavailable} role="status">
          Údaje zatiaľ nie sú dostupné.
          {!isArticle ? " Štatistiky profilov vyžadujú migráciu D1 0167." : ""}
        </p>
      ) : (
        <dl className={styles.metrics}>
          {WINDOWS.map(({ key, label }) => (
            <div key={key} className={styles.metric}>
              <dt>{label}</dt>
              <dd>{formatter.format(summary[key])}×</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
