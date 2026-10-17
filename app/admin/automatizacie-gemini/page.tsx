import Link from "next/link";
import { env } from "cloudflare:workers";
import { AdminShell } from "@/components/admin-shell";
import { AdminGeminiAutomationSettings } from "@/components/admin-gemini-automation-settings";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { geminiAutomationSections } from "@/lib/gemini-automation-catalog";
import { geminiSettingViews } from "@/lib/gemini-automation-admin-settings";
import { requireGeminiAdminD1 } from "@/lib/gemini-automation-admin-db";
import {
  listGeminiSettings,
  listRecentGeminiRuns,
  type GeminiRecentRun,
} from "@/lib/gemini-automation-admin-store";
import {
  geminiManualBackgroundEnabled,
  listGeminiManualBackgroundJobs,
  type GeminiQueuedJob,
} from "@/lib/gemini-automation-background-queue";
import { externalAgentEnabled } from "@/lib/gemini-external-agent";
import styles from "@/components/admin-gemini-automation.module.css";

export const dynamic = "force-dynamic";

export default async function AdminGeminiAutomationPage() {
  const user = await requireAdminPageUser("/admin/automatizacie-gemini");
  let settings = geminiSettingViews([]);
  let runs: GeminiRecentRun[] = [];
  let queuedJobs: GeminiQueuedJob[] = [];
  const externalEnabled = externalAgentEnabled(env);
  const backgroundEnabled = geminiManualBackgroundEnabled(
    env as unknown as { GEMINI_ASYNC_MANUAL_ENABLED?: string },
  );
  const queueEnabled = externalEnabled || backgroundEnabled;
  let ready = true;

  try {
    const db = requireGeminiAdminD1();
    [settings, runs] = await Promise.all([
      listGeminiSettings(db),
      listRecentGeminiRuns(db),
    ]);
    if (queueEnabled) queuedJobs = await listGeminiManualBackgroundJobs(db);
  } catch {
    ready = false;
  }

  return (
    <AdminShell
      user={user}
      eyebrow="Automatizácie a kvalita"
      title="Automatizácie Gemini"
      description="Vyhľadávanie a kontrola neverejných konceptov v 22 kategóriách."
      actions={<Link className="admin-primary-action" href="/admin/automatizacie-gemini/prompty">
        Prompty kategórií →
      </Link>}
    >
      {!ready && (
        <p className={styles.warning} role="alert">
          Gemini databázové nastavenia nie sú dostupné. Over migrácie 0113 a 0126.
          Ukladanie a manuálne spustenie sú dočasne vypnuté; zobrazené údaje nemusia byť aktuálne.
        </p>
      )}
      <AdminGeminiAutomationSettings
        sections={geminiAutomationSections}
        settings={settings}
        available={ready}
        externalEnabled={externalEnabled}
        queueEnabled={queueEnabled}
        initialJobs={queuedJobs}
        recentRuns={runs}
      />
    </AdminShell>
  );
}
