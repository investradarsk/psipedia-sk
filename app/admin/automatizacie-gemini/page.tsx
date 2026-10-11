import Link from "next/link";
import { env } from "cloudflare:workers";
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
import {geminiManualBackgroundEnabled,listGeminiManualBackgroundJobs,type GeminiQueuedJob} from "@/lib/gemini-automation-background-queue";
import { externalAgentEnabled } from "@/lib/gemini-external-agent";
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
              <th scope="col">API volania</th>
              <th scope="col">Google dotazy</th>
              <th scope="col">Kandidáti</th>
              <th scope="col">Duplicity</th>
              <th scope="col">Koncepty</th>
              <th scope="col">Chyby</th>
              <th scope="col">Dokončenie</th>
              <th scope="col">Kód chyby</th>
            </tr></thead>
            <tbody>{runs.map((run) => (
              <tr key={run.id}>
                <td>{formatDate(run.startedAt)}</td>
                <td>{labels.get(run.stableKey) ?? run.subcategory}</td>
                <td>{run.trigger}</td>
                <td>{run.status}</td>
                <td>{run.model}</td>
                <td>{run.requestCount}</td>
                <td>{run.groundedSearchQueryCount}</td>
                <td>{run.candidateCount}</td>
                <td>{run.duplicateCount}</td>
                <td>{run.conceptCount}</td>
                <td>{run.errorCount}</td>
                <td>{formatDate(run.completedAt)}</td>
                <td>{run.errorCode ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
    </section>
  );
}

function GeminiQueueHistory({jobs}:{jobs:GeminiQueuedJob[]}) {
  return <section className={styles.history} aria-label="Gemini úlohy na pozadí">
    <h2>Úlohy na pozadí</h2>
    {!jobs.length ? <p className={styles.empty}>Zatiaľ žiadne úlohy na pozadí.</p> :
      <div className={styles.tableScroll}><table className={styles.historyTable}>
        <thead><tr><th>ID</th><th>Podkategória</th><th>Stav</th><th>Vytvorené</th><th>Beh</th><th>Chyba</th></tr></thead>
        <tbody>{jobs.map(job=><tr key={job.id}>
          <td>{job.id}</td>
          <td>{geminiAutomationCatalog.find(category=>category.stableKey===job.stable_key)?.label??job.stable_key}</td>
          <td>{job.status}</td><td>{formatDate(job.created_at)}</td>
          <td>{job.run_id??"—"}</td><td>{job.error_code??"—"}</td>
        </tr>)}</tbody>
      </table></div>}
    <p>Ak úloha zostane v stave RUNNING po neočakávanom prerušení, vyžaduje manuálnu diagnostiku. Systém nikdy nezačne platené opakovanie automaticky.</p>
  </section>;
}
export default async function AdminGeminiAutomationPage() {
  const user = await requireAdminPageUser("/admin/automatizacie-gemini");
  let settings = geminiSettingViews([]);
  let runs: GeminiRecentRun[] = [];
  let queuedJobs:GeminiQueuedJob[]=[];
  const externalEnabled = externalAgentEnabled(env);
  const backgroundEnabled=geminiManualBackgroundEnabled(env as unknown as {GEMINI_ASYNC_MANUAL_ENABLED?:string});
  const showQueue = externalEnabled || backgroundEnabled;
  let ready = true;
  try {
    const db = requireGeminiAdminD1();
    [settings, runs] = await Promise.all([listGeminiSettings(db), listRecentGeminiRuns(db)]);
    if(showQueue) queuedJobs=await listGeminiManualBackgroundJobs(db);
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
        {externalEnabled
          ? "Samostatný GitHub pracovník pre Gemini + Notion je zapnutý. Tu nastavíš frekvenciu, kategóriu a počet konceptov. Platené volania podliehajú ďalšiemu vypínaču priamo v GitHube. Výsledky uvidíš v histórii."
          : "Externý GitHub pracovník zatiaľ nie je aktivovaný. Uloženie nastavenia samo nespúšťa platené vyhľadávanie; starý manuálny režim zostáva oddelený."}
      </p>
      {externalEnabled
        ? <p>Nové externé koncepty sú uložené priamo v Notione; počty nájdeš nižšie v histórii behov.</p>
        : <p><Link className="admin-primary-action" href="/admin/automatizacie-gemini/koncepty">Koncepty Gemini →</Link></p>}
      <AdminGeminiAutomationSettings sections={geminiAutomationSections} settings={settings} available={ready} externalEnabled={externalEnabled} />
      {showQueue && <GeminiQueueHistory jobs={queuedJobs} />}
      <GeminiRunHistory runs={runs} />
    </AdminShell>
  );
}
