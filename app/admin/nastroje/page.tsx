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
      title="Technické nástroje"
      description="Operator utility a údržbové workflow, ktoré nie sú upozorneniami. Canonical obsah, automation review a mapové operácie zostávajú vo svojich vlastných sekciách."
    >
      <section className={styles.hubGrid} aria-label="Technické nástroje">
        <Link className={styles.hubCard} href="/admin/import">
          <span className={styles.hubKicker}>Dáta</span>
          <h2>Import dát</h2>
          <p>Kontrolovaný import a preview pre admin dátové workflowy.</p>
          <span className={styles.hubOpen}>Otvoriť import →</span>
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
