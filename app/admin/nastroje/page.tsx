import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-v5-technical-tools.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";

export default async function AdminTechnicalToolsPage() {
  const user = await requireAdminPageUser("/admin/nastroje");

  return (
    <AdminShell
      user={user}
      eyebrow="Admin"
      title="Nástroje"
      description="Import, audit a údržba. Platené GEO a Google Places operácie sa spúšťajú iba ručne."
    >
      <section className={styles.workspace} data-admin-content-module="technical-tools" aria-label="Nástroje">
        <nav className={styles.toolList} aria-label="Základné nástroje">
          <Link className={styles.toolLink} href="/admin/import">
            <span className={styles.toolLabel}>Import dát</span>
            <span className={styles.toolDescription}>Náhľad a kontrolovaný import</span>
          </Link>
          <Link className={styles.toolLink} href="/admin/nastroje/notion-audit">
            <span className={styles.toolLabel}>Kontrola údajov v Notione</span>
            <span className={styles.toolDescription}>Samostatná diagnostika a konflikty</span>
          </Link>
          <Link className={styles.toolLink} href="/admin/operations/outreach">
            <span className={styles.toolLabel}>Profilový outreach</span>
            <span className={styles.toolDescription}>Kontrolované oslovenia profilov</span>
          </Link>
        </nav>
        <details className={styles.advanced} data-admin-advanced-tools>
          <summary>Rozšírené nástroje · GEO, Google Places a adresy</summary>
          <nav className={styles.toolList} aria-label="Rozšírené technické nástroje">
            <Link className={styles.toolLink} href="/admin/nastroje/geo">
              <span className={styles.toolLabel}>GEO operácie</span>
              <span className={styles.toolDescription}>Preview, diagnostika a obmedzené dávky</span>
            </Link>
            <Link className={styles.toolLink} href="/admin/nastroje/google-places">
              <span className={styles.toolLabel}>Google Places · Place ID canary</span>
              <span className={styles.toolDescription}>Ručné overenie a potvrdenie identity</span>
            </Link>
            <Link className={styles.toolLink} href="/admin/nastroje/address-enrichment">
              <span className={styles.toolLabel}>Doplnenie adries</span>
              <span className={styles.toolDescription}>Kontrolované provider overenie</span>
            </Link>
            <Link className={styles.toolLink} href="/admin/nastroje/address-research-import">
              <span className={styles.toolLabel}>Import research adries</span>
              <span className={styles.toolDescription}>Náhľad a ručné použitie datasetu</span>
            </Link>
          </nav>
        </details>
      </section>
    </AdminShell>
  );
}
