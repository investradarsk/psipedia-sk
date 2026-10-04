import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAutomationSourceSettings } from "@/components/admin-automation-source-settings";
import { AdminShell } from "@/components/admin-shell";
import { AdminAutomationAvailabilityState } from "@/app/admin/automatizacie/_components/automation-availability-state";
import { requireAdminPageUser } from "@/lib/admin-auth";
import {
  automationSourceActivationReadiness,
  automationSourceTechnicalGovernanceRetryable,
} from "@/lib/data-automation-source-activation";
import { env } from "cloudflare:workers";
import { getAutomationSourceAdmin } from "@/lib/data-automation-source-store";
import {
  automationCategoryBySlug,
  automationCategoryForSource,
  automationSourceActivationStatusMessage,
} from "@/lib/admin-automation-presentation";
import { listAutomationSourceCanonicalContent } from "@/lib/data-automation-product-store";
import { readAdminAutomationData, summarizeAdminAutomationReads } from "@/lib/admin-automation-reliability";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
type Bindings = { DB?: D1Database };

export default async function AutomationSourceDetailPage({ params }: Props) {
  const rawId = (await params).id;
  const user = await requireAdminPageUser("/admin/automatizacie/zdroje/" + rawId);
  const id = Number.parseInt(rawId, 10);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const sourceRead = await readAdminAutomationData({
    key: `source-detail:${id}:source`,
    load: () => getAutomationSourceAdmin(id),
    fallback: null,
    empty: (value) => value === null,
  });
  const sourceOnlyReliability = summarizeAdminAutomationReads([sourceRead]);
  if (sourceRead.status === "UNAVAILABLE") {
    return (
      <AdminShell
        user={user}
        eyebrow="Automatizácie"
        title="Zdroj automatizácie"
        description="Detail zdroja sa momentálne nepodarilo bezpečne načítať."
        actions={<Link href="/admin/automatizacie">← Späť na automatizácie</Link>}
      >
        <AdminAutomationAvailabilityState summary={sourceOnlyReliability} refreshHref={`/admin/automatizacie/zdroje/${id}`} />
      </AdminShell>
    );
  }
  const source = sourceRead.data;
  if (!source) notFound();
  const categorySlug = automationCategoryForSource(source);
  const category = categorySlug ? automationCategoryBySlug(categorySlug) : null;
  const db = (env as unknown as Bindings).DB;
  const [readinessRead, contentRead] = await Promise.all([
    readAdminAutomationData({
      key: `source-detail:${id}:readiness`,
      load: async () => {
        if (!db) throw new Error("DB binding unavailable");
        return automationSourceActivationReadiness(source, db);
      },
      fallback: null,
      empty: (value) => value === null,
    }),
    readAdminAutomationData({
      key: `source-detail:${id}:canonical-content`,
      load: () => listAutomationSourceCanonicalContent(source.id),
      fallback: [],
      empty: (value) => value.length === 0,
    }),
  ]);
  const reliability = summarizeAdminAutomationReads([sourceRead, readinessRead, contentRead]);
  const readiness = readinessRead.data;
  const content = contentRead.data;
  const monitoringReady = readiness?.ready === true;
  const monitoringRetryable = readiness
    ? automationSourceTechnicalGovernanceRetryable(readiness)
    : false;
  const monitoringStatusMessage = automationSourceActivationStatusMessage(readiness, monitoringRetryable);

  return (
    <AdminShell user={user} eyebrow="Automatizácie" title={source.label} description={source.sourceUrl ?? "Schválený zdroj"}
      actions={<Link href={categorySlug ? "/admin/automatizacie/" + categorySlug : "/admin/automatizacie"}>← Späť na zdroje</Link>}>
      <AdminAutomationAvailabilityState summary={reliability} refreshHref={`/admin/automatizacie/zdroje/${id}`} />
      <AdminAutomationSourceSettings
        source={source}
        draftsHref={category?.draftsHref ?? "/admin"}
        content={content}
        monitoringReady={monitoringReady}
        monitoringRetryable={monitoringRetryable}
        monitoringStatusMessage={monitoringStatusMessage}
      />
    </AdminShell>
  );
}
