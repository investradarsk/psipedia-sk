import { AdminDataQualityDashboard } from "@/components/admin-data-quality-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { loadDataQualityDashboard } from "@/lib/data-quality-store";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function positivePage(value: string | string[] | undefined) {
  const raw = firstParam(value);
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export default async function AdminDataQualityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireAdminPageUser("/admin/kvalita");
  const params = await searchParams;
  const mediaSection = firstParam(params.section) === "media";
  const requestedCategory = firstParam(params.category);
  const data = await loadDataQualityDashboard({
    profilePage: positivePage(params.page),
    mediaPage: positivePage(params.mediaPage),
    category: !mediaSection && requestedCategory === "podujatia" ? "all" : requestedCategory,
    issue: firstParam(params.issue),
    profileStatus: firstParam(params.status),
    priority: firstParam(params.priority),
    solution: firstParam(params.solution),
    query: firstParam(params.q),
    region: firstParam(params.region),
    district: firstParam(params.district),
    mediaStatus: firstParam(params.mediaStatus),
  });

  return (
    <AdminShell
      user={user}
      eyebrow="Admin · Kvalita údajov"
      title="Kvalita údajov"
      description="Chýbajúce údaje v profiloch a automatická kontrola log, obrázkov a ich pôvodných zdrojov."
    >
      <AdminDataQualityDashboard data={data} />
    </AdminShell>
  );
}
