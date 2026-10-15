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

const zeroResultLabels: Record<string, string> = {
  NO_RESULT_NO_RELEVANT_CANDIDATE: "Nenašiel sa vhodný nový subjekt.",
  NO_RESULT_DUPLICATE_ONLY: "Gemini označilo kandidátov za duplicity; nový koncept nevznikol. Automatické potvrdenie zhody nie je evidované.",
  NO_RESULT_INSUFFICIENT_EVIDENCE: "Chýbajú dostatočne overiteľné informácie.",
  NO_RESULT_EXHAUSTED: "Možnosti vyhľadávania boli vyčerpané.",
};

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
              <th scope="col">Výsledok / kód chyby</th>
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
                <td>{run.status === "SUCCESS" && run.conceptCount === 0
                  ? zeroResultLabels[run.errorCode ?? ""] ?? "Bez nového konceptu (dôvod nezaznamenaný)."
                  : run.errorCode ?? "—"}</td>
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
    <p>Aktuálne GitHub Actions: <a href="https://github.com/investradarsk/psipedia-sk/actions/workflows/gemini-notion-agent.yml" target="_blank" rel="noreferrer">Gemini Notion agent ↗</a>. Beh je potrebné spárovať podľa času spustenia; číslo úlohy nie je číslo GitHub behu.</p>
    {!jobs.length ? <p className={styles.empty}>Zatiaľ žiadne úlohy na pozadí.</p> :
      <div className={styles.tableScroll}><table className={styles.historyTable}>
        <thead><tr><th>ID</th><th>Podkategória</th><th>Stav</th><th>Vytvorené</th><th>Beh</th><th>Chyba</th></tr></thead>
        <tbody>{jobs.map(job=><tr key={job.id}>
          <td>{job.id}</td>
          <td>{geminiAutomationCatalog.find(category=>category.stableKey===job.stable_key)?.label??job.stable_key}</td>
          <td>{job.status === "SUCCESS" && !job.run_id ? "NEÚPLNÝ ZÁPIS" : job.status}</td><td>{formatDate(job.created_at)}</td>
          <td>{job.run_id??"—"}</td><td>{job.error_code ?? (job.status === "SUCCESS" && !job.run_id ? "Chýba potvrdený záznam behu" : "—")}</td>
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
      description="Správa externého Gemini vyhľadávania pre všetkých 22 kategórií."
    >
      {!ready && <p className={styles.warning} role="alert">
        Gemini databázové nastavenia nie sú dostupné. Over, či boli aplikované migrácie 0113 a 0126.
        Ukladanie je dočasne vypnuté.
      </p>}
      <p className={styles.notice}>
        {externalEnabled
          ? "Samostatný GitHub pracovník pre Gemini + Notion je zapnutý. Tu nastavíš frekvenciu, kategóriu a počet konceptov. Platené volania podliehajú ďalšiemu vypínaču priamo v GitHube. Výsledky uvidíš v histórii."
          : "Externý GitHub pracovník zatiaľ nie je aktivovaný. Uloženie nastavenia samo nespúšťa platené vyhľadávanie; starý manuálny režim zostáva oddelený."}
      </p>
      <p className={styles.notice}>Mesačný počet úloh Psipedia neobmedzuje. Platené volania stále podliehajú nastaveniam GitHubu, limitom jedného behu a kreditu alebo kvóte u poskytovateľa Gemini. Rozpočet 5 € nastavený u poskytovateľa nie je garanciou Psipedie.</p>
      {queuedJobs.some((job) => job.status === "RUNNING") && <p role="status" className={styles.warning}>Gemini úloha práve beží. Ak zostane v stave RUNNING dlhšie než dve hodiny, ďalšie platené spustenia ostanú zablokované do manuálneho overenia v GitHub Actions. Systém ju automaticky neopakuje.</p>}
      <p><Link className="admin-primary-action" href="/admin/automatizacie-gemini/prompty">
        Upraviť prompty pre 22 kategórií →
      </Link></p>
      {externalEnabled && runs.some(run => run.status === "SUCCESS" && run.conceptCount > 0) && (
        <p role="status" className={styles.notice}>
          Gemini vytvorilo {runs.find(run => run.status === "SUCCESS" && run.conceptCount > 0)?.conceptCount} nových konceptov pri poslednom úspešnom behu s novými výsledkami.
        </p>
      )}
      {externalEnabled
        ? <p>Koncepty služieb nájdeš pod kartami. Kontrolu konceptov Podujatí a Pomoci psom sprístupní spoločný editor zo súbežnej úlohy #03. Načítajú sa z Notionu aj pred synchronizáciou do adresára.</p>
        : <p><Link className="admin-primary-action" href="/admin/automatizacie-gemini/koncepty">Koncepty Gemini →</Link></p>}
      <AdminGeminiAutomationSettings sections={geminiAutomationSections} settings={settings} available={ready} externalEnabled={externalEnabled} />
      {showQueue && <GeminiQueueHistory jobs={queuedJobs} />}
      <GeminiRunHistory runs={runs} />
    </AdminShell>
  );
}
