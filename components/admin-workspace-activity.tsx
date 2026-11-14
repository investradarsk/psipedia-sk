import Link from "next/link";
import type { WorkspaceOverview } from "@/lib/admin-workspace-feed";
import styles from "./admin-workspace-activity.module.css";

function formatTime(raw: string) {
  const date = new Date(raw);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("sk-SK", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Bratislava" })
    : "—";
}

/**
 * The workspace is a navigation hub, not another inbox. The notification bell
 * and canonical queues own item-level activity and acknowledgement.
 */
export function AdminWorkspaceActivity({ initial }: { initial: WorkspaceOverview }) {
  return (
    <section className={styles.root} aria-label="Prejsť do pracovných sekcií">
      <div className={styles.titleRow}>
        <div>
          <small>Rýchly prehľad</small>
          <h2>Otvoriť pracovnú sekciu</h2>
          <p>Vyber oblasť, v ktorej chceš pokračovať. Jednotlivé udalosti nájdeš v príslušnej agende.</p>
        </div>
      </div>
      <div className={styles.links}>
        <Link href="/admin/operations" className={styles.linkCard}>
          <strong>Podnety a upozornenia</strong>
          <span>Čakajúce schválenia a žiadosti</span>
          <b>Otvoriť upozornenia →</b>
        </Link>
        <Link href="/admin/mapy" className={styles.linkCard}>
          <strong>Adresy a polohy na overenie</strong>
          <span>Neúplné, nejednoznačné alebo nepotvrdené lokality profilov</span>
          <b>Otvoriť mapy →</b>
        </Link>
        <Link href="/admin/automatizacie-gemini" className={styles.linkCard}>
          <strong>Automatizácie Gemini</strong>
          <span>{initial.nextGemini
            ? `Najbližšie: ${initial.nextGemini.label}, ${formatTime(initial.nextGemini.nextRunAt)}`
            : "Najbližšie spustenie nie je potvrdené"}</span>
          <b>Otvoriť plánovač →</b>
        </Link>
        <Link href="/admin/facebook-obrazky" className={styles.linkCard}>
          <strong>Facebook obrázky</strong>
          <span>Príspevky, schvaľovanie a publikovanie</span>
          <b>Otvoriť Facebook obrázky →</b>
        </Link>
      </div>
      {initial.status === "UNAVAILABLE" &&
        <p role="status" className={styles.note}>Termín najbližšej automatizácie sa nepodarilo načítať. Pracovné sekcie môžeš stále otvoriť.</p>}
    </section>
  );
}
