import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";

export default async function AdminTechnicalToolsPage() {
  const user = await requireAdminPageUser("/admin/nastroje");

  return (
    <AdminShell
      user={user}
      eyebrow="Admin"
      title="Nástroje"
      description="Technické a operator utility pre údržbu systému. Upozornenia, Automatizácie a Mapy zostávajú samostatné produktové sekcie."
    >
      <section className={styles.hubGrid} aria-label="Nástroje">
        <Link className={styles.hubCard} href="/admin/import">
          <span className={styles.hubKicker}>Dáta</span>
          <h2>Import dát</h2>
          <p>Kontrolovaný import a preview pre admin dátové workflowy.</p>
          <span className={styles.hubOpen}>Otvoriť import →</span>
        </Link>

        <Link className={styles.hubCard} href="/admin/nastroje/geo">
          <span className={styles.hubKicker}>GEO</span>
          <h2>GEO nástroje</h2>
          <p>Preview, canary, bounded backfill a diagnostika existujúcej GEO pipeline.</p>
          <span className={styles.hubOpen}>Otvoriť GEO nástroje →</span>
        </Link>

        <Link className={styles.hubCard} href="/admin/nastroje/google-places">
          <span className={styles.hubKicker}>GOOGLE PLACES</span>
          <h2>Place ID canary</h2>
          <p>Bounded preview a explicitný apply Google Place identity pre exact DIRECTORY profily.</p>
          <span className={styles.hubOpen}>Otvoriť Place ID canary →</span>
        </Link>

        <Link className={styles.hubCard} href="/admin/nastroje/address-enrichment">
          <span className={styles.hubKicker}>DIRECTORY</span>
          <h2>Doplnenie adries</h2>
          <p>Kontrolovaný live canary pre discovery, exact provider verification a explicitný canonical apply.</p>
          <span className={styles.hubOpen}>Otvoriť address canary →</span>
        </Link>

        <Link className={styles.hubCard} href="/admin/operations/outreach">
          <span className={styles.hubKicker}>Operator utility</span>
          <h2>Profilový outreach</h2>
          <p>Dry-run a bounded odosielanie kontrolovaných oslovení na overenie verejných profilov.</p>
          <span className={styles.hubOpen}>Otvoriť outreach →</span>
        </Link>
      </section>
    </AdminShell>
  );
}
