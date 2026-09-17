"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OrganizationPublicationAdminItem } from "@/lib/help-organization-admin-store";
import styles from "./admin-lost-found.module.css";

const statusLabels = {
  DRAFT: "Koncept",
  PUBLISHED: "Publikované",
  ARCHIVED: "Archivované",
} as const;

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Bratislava",
  }).format(date);
}

export function AdminOrganizationPublicationDashboard({ items }: { items: OrganizationPublicationAdminItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = items.reduce((acc, item) => {
    acc[item.status] += 1;
    return acc;
  }, { DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0 });

  async function changePublication(item: OrganizationPublicationAdminItem, action: "publish" | "unpublish") {
    const question = action === "publish"
      ? `Publikovať organizáciu „${item.name}“? Verejný profil aj sitemap ju začnú považovať za publikovanú.`
      : `Presunúť organizáciu „${item.name}“ do konceptu? Verejný profil prestane byť dostupný a vypadne zo sitemap.`;
    if (!window.confirm(question)) return;

    setBusyId(item.id);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/admin/organizations/${item.id}/publication`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, expectedUpdatedAt: item.updatedAt }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Publication zmenu sa nepodarilo uložiť.");
      setMessage(action === "publish" ? "Organizácia bola publikovaná." : "Organizácia bola presunutá do konceptu.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Publication zmenu sa nepodarilo uložiť.");
    } finally {
      setBusyId(null);
    }
  }

  return <>
    <nav className={styles.tabs} aria-label="Stavy organizácií">
      <span className={styles.type}>Všetky <strong>{items.length}</strong></span>
      <span className={styles.type}>Koncepty <strong>{counts.DRAFT}</strong></span>
      <span className={styles.type}>Publikované <strong>{counts.PUBLISHED}</strong></span>
      <span className={styles.type}>Archivované <strong>{counts.ARCHIVED}</strong></span>
    </nav>

    {message && <p className={styles.message} role="status">{message}</p>}
    {error && <p className={`${styles.message} ${styles.error}`} role="alert">{error}</p>}

    <div className={styles.tableWrap} role="region" aria-label="Publication workflow organizácií" tabIndex={0}>
      <table className={styles.table}>
        <thead><tr><th scope="col">Organizácia</th><th scope="col">Stav</th><th scope="col">Preflight</th><th scope="col">Quality warnings</th><th scope="col">Publikovanie</th><th scope="col">Akcia</th></tr></thead>
        <tbody>
          {items.map((item) => {
            const isPublic = item.status === "PUBLISHED" && Boolean(item.publishedAt) && !item.archivedAt;
            const canPublish = item.status === "DRAFT" && item.preflight.ready;
            const published = formatDate(item.publishedAt);
            return <tr key={item.id}>
              <td><div className={styles.rowTitle}><strong>{item.name || "Bez názvu"}</strong><small>#{item.id} · /organizacie/{item.slug || "—"}</small></div></td>
              <td className={styles.status}>{statusLabels[item.status]}</td>
              <td><div className={styles.rowTitle}><strong>{item.preflight.ready ? "READY" : "BLOCKED"}</strong>{item.preflight.blockers.map((blocker) => <small key={blocker.code}>{blocker.message}</small>)}</div></td>
              <td><div className={styles.rowTitle}>{item.preflight.warnings.length ? item.preflight.warnings.map((warning) => <small key={warning.code}>{warning.message}</small>) : <small>Bez upozornení</small>}</div></td>
              <td><div className={styles.rowTitle}><strong>{isPublic ? "Verejný profil" : "Neverejný profil"}</strong>{published && <small>published_at {published}</small>}{isPublic && <Link className={styles.edit} href={`/organizacie/${item.slug}`} target="_blank">Otvoriť profil ↗</Link>}</div></td>
              <td>
                {item.status === "DRAFT" && <button className={styles.primary} type="button" disabled={!canPublish || busyId === item.id} onClick={() => changePublication(item, "publish")}>{busyId === item.id ? "Ukladám…" : "Publikovať"}</button>}
                {item.status === "PUBLISHED" && <button className={styles.danger} type="button" disabled={busyId === item.id} onClick={() => changePublication(item, "unpublish")}>{busyId === item.id ? "Ukladám…" : "Presunúť do konceptu"}</button>}
                {item.status === "ARCHIVED" && <span className={styles.help}>Mimo ORG-8A</span>}
              </td>
            </tr>;
          })}
          {!items.length && <tr><td colSpan={6}>Žiadne organizácie.</td></tr>}
        </tbody>
      </table>
    </div>
  </>;
}
