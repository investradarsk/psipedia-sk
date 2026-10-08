import { AdminShell } from "@/components/admin-shell";
import { AdminGeminiAutomationSettings } from "@/components/admin-gemini-automation-settings";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { geminiAutomationCatalog, geminiAutomationSections } from "@/lib/gemini-automation-catalog";
import { geminiSettingViews } from "@/lib/gemini-automation-admin-settings";
import { requireGeminiAdminD1 } from "@/lib/gemini-automation-admin-db";
import {
  listGeminiSettings, listRecentGeminiRuns,
  type GeminiRecentRun,
} from "@/lib/gemini-automation-admin-store";
import styles from "@/components/admin-gemini-automation.module.css";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "short", timeStyle: "short", timeZone: "Europe/Bratislava",
  }).format(parsed);
}

function GeminiRunHistory({ runs }: { runs: GeminiRecentRun[] }) {
  const labels = new Map(geminiAutomationCatalog.map((item) => [item.stableKey, item.label]));
  return (
    <section className={styles.history} aria-labelledby="gemini-history-title">
      <h2 id="gemini-history-title">História behov</h2>
      {runs.length === 0
        ? <p className={styles.empty}>Zatiaľ nie sú zaznamenané žiadne behy Gemini automatizácií.</p>
        : <div className={styles.tableScroll}>
          <table className={styles.historyTable}>
            <thead><tr>
              <th scope="col">Dátum</th>
              <th scope="col">Podkategória</th>
              <th scope="col">Spustenie</th>
              <th scope="col">Stav</th>
              <th scope="col">Model</th>
              <th scope="col">Kandidáti</th>
              <th scope="col">Duplicity</th>
              <th scope="col">Koncepty</th>
              <th scope="col">Chyba</th>
            </tr></thead>
            <tbody>{runs.map((run) => (
              <tr key={run.id}>
                <td>{formatDate(run.startedAt)}</td>
                <td>{labels.get(run.stableKey) ?? run.subcategory}</td>
                <td>{run.trigger}</td>
                <td>{run.status}</td>
                <td>{run.model}</td>
                <td>{run.candidateCount}</td>
                <td>{run.duplicateCount}</td>
                <td>{run.conceptCount}</td>
                <td>{run.errorCode ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
    </section>
  );
}

export default async function AdminGeminiAutomationPage() {
  const user = await requireAdminPageUser("/admin/automatizacie-gemini");
  let settings = geminiSettingViews([]);
  let runs: GeminiRecentRun[] = [];
  let ready = true;
  try {
    const db = requireGeminiAdminD1();
    [settings, runs] = await Promise.all([listGeminiSettings(db), listRecentGeminiRuns(db)]);
  } catch {
    ready = false;
  }
  return (
    <AdminShell
      user={user}
      eyebrow="Automatizácie a kvalita"
      title="Automatizácie Gemini"
      description="Samostatné nastavenia nového systému pre služby, podujatia a pomoc psom."
    >
      {!ready && <p className={styles.warning} role="alert">
        Gemini databázové nastavenia nie sú dostupné. Over, či bola aplikovaná migrácia 0113.
        Ukladanie je dočasne vypnuté.
      </p>}
      <p className={styles.notice}>
        Zatiaľ ide iba o konfiguráciu. Zapnutie kategórie nespúšťa Gemini ani nevytvára koncepty.
        Ďalší čas je orientačný pre budúce zapojenie plánovača.
      </p>
      <AdminGeminiAutomationSettings sections={geminiAutomationSections} settings={settings} available={ready} />
      <GeminiRunHistory runs={runs} />
    </AdminShell>
  );
}
