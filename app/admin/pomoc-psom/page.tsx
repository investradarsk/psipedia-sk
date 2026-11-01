import { AdminDirectoryModuleNav } from "@/components/admin-directory-module-nav";
import { AdminHelpUnifiedTable, type HelpDirectoryRow } from "@/components/admin-help-unified-table";
import { AdminSectionHub, type AdminSectionHubItem } from "@/components/admin-section-hub";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { adoptionStatusLabels } from "@/lib/adoption";
import { listAdoptionAdminDashboard } from "@/lib/adoption-admin-store";
import { parseOrganizationAdminFilters } from "@/lib/help-organization-admin-query";
import { getOrganizationAdminPage } from "@/lib/help-organization-admin-store";
import { parseHelpAdminFilters } from "@/lib/help-admin-query";
import { getManagedHelpDashboard } from "@/lib/help-store";
import { helpCategories } from "@/lib/help";
import { listAdminDogReports } from "@/lib/lost-found-dog-store";
import { dogReportStatusLabel, dogReportTypeShortLabel } from "@/lib/lost-found-dogs";
import styles from "@/components/admin-help-unified-table.module.css";

export const dynamic = "force-dynamic";

const hrefByCategory: Record<(typeof helpCategories)[number]["slug"], string> = {
  adopcia: "/admin/adopcie",
  utulky: "/admin/organizacie?type=SHELTER",
  "docasna-opatera": "/admin/pomoc?category=docasna-opatera",
  zbierky: "/admin/pomoc?category=zbierky",
  "stratene-a-najdene": "/admin/stratene-najdene",
  dobrovolnictvo: "/admin/pomoc?category=dobrovolnictvo",
};
type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";

async function loadTable(category: (typeof helpCategories)[number]["slug"], q: string, page: number) {
  let rows: HelpDirectoryRow[] = [];
  let total = 0;
  let pages = 1;
  let currentPage = page;
  if (category === "adopcia") {
    const data = await listAdoptionAdminDashboard({ q, page });
    total = data.pagination.total; pages = data.pagination.totalPages; currentPage = data.pagination.page;
    rows = data.items.map(item => ({
      id: item.id, title: item.name, detail: [item.breedName, item.organizationName].filter(Boolean).join(" · "),
      category, status: adoptionStatusLabels[item.status], city: item.city, updatedAt: item.updatedAt, href: "/admin/adopcie/" + item.id,
    }));
  } else if (category === "stratene-a-najdene") {
    const data = await listAdminDogReports({ q, page, pageSize: 50 });
    total = data.total; pages = data.pages; currentPage = data.page;
    rows = data.items.map(item => ({
      id: item.id, title: item.dogName || item.breed || "Hlásenie #" + item.id,
      detail: dogReportTypeShortLabel(item.type), category, status: dogReportStatusLabel[item.status],
      city: item.city, updatedAt: item.updatedAt, href: "/admin/stratene-najdene/" + item.id,
    }));
  } else if (category === "utulky") {
    const data = await getOrganizationAdminPage(parseOrganizationAdminFilters({ get: key =>
      key === "q" ? q : key === "page" ? String(page) : key === "type" ? "SHELTER" : null,
    }));
    total = data.pagination.total; pages = data.pagination.totalPages; currentPage = data.pagination.page;
    rows = data.items.map(item => ({
      id: item.id, title: item.name, detail: item.type, category,
      status: item.status === "PUBLISHED" ? "Publikované" : item.status === "DRAFT" ? "Koncept" : "Archivované",
      city: item.primaryCity || item.city, updatedAt: item.updatedAt, href: "/admin/organizacie/" + item.id,
    }));
  } else {
    const data = await getManagedHelpDashboard(parseHelpAdminFilters({ get: key =>
      key === "category" ? category : key === "q" ? q : key === "page" ? String(page) : null,
    }));
    total = data.resultCount; pages = data.pages; currentPage = data.page;
    rows = data.items.map(item => ({
      id: item.id, title: item.title, detail: item.organization || item.dogName || "",
      category, status: item.resolved ? "Vybavené" : item.status === "published" ? "Publikované" : "Koncept",
      city: item.city, updatedAt: "", href: "/admin/pomoc/" + item.id,
    }));
  }
  return { rows, total, pages, page: currentPage };
}

export default async function AdminDogHelpPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin/pomoc-psom");
  const raw = await searchParams;
  const requested = first(raw.category);
  const category = helpCategories.find(item => item.slug === requested)?.slug ?? "adopcia";
  const q = first(raw.q).trim().slice(0, 80);
  const page = Math.min(100_000, Math.max(1, Number.parseInt(first(raw.page) || "1", 10) || 1));
  const items: AdminSectionHubItem[] = helpCategories.map(item => ({
    label: item.slug === "utulky" ? "Útulky" : item.label,
    description: item.slug === "utulky"
      ? "Správa útulkov podľa toho, čo reálne robia. Právna forma tu nie je pracovná kategória."
      : item.description,
    icon: item.icon, href: hrefByCategory[item.slug],
  }));
  const table = await loadTable(category, q, page);

  return (
    <AdminShell user={user} eyebrow="Pomoc psom" title="Pomoc psom"
      description="Vyber kategóriu a otvor konkrétny profil priamo z tabuľky. Úpravy prebiehajú v pôvodných editoroch.">
      <AdminDirectoryModuleNav active="help" />
      <AdminHelpUnifiedTable
        category={category}
        categories={helpCategories.map(item => ({ slug: item.slug, label: item.label, icon: item.icon, href: hrefByCategory[item.slug] }))}
        rows={table.rows}
        query={q}
        page={table.page}
        pages={table.pages}
        total={table.total}
      />
      <div className={styles.mobileHub}><AdminSectionHub items={items} /></div>
    </AdminShell>
  );
}
