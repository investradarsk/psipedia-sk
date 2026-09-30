import { AdminDataQualityDashboard } from "@/components/admin-data-quality-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { loadDataQualityDashboard } from "@/lib/data-quality-store";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function positivePage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
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
  const rawCategory = Array.isArray(params.category) ? params.category[0] : params.category;
  const data = await loadDataQualityDashboard({
    profilePage: positivePage(params.page),
    mediaPage: positivePage(params.mediaPage),
    category: rawCategory,
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
