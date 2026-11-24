import { Suspense } from "react";
import { AdminDataLoading } from "@/components/admin-data-loading";
import { AdminHelpUnifiedTable, type HelpDirectoryRow, type HelpDirectoryCategory } from "@/components/admin-help-unified-table";
import { adminDetailHref } from "@/lib/admin-return-navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminProfileTypeTabs } from "@/components/admin-profile-type-tabs";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { adoptionStatusLabels } from "@/lib/adoption";
import { listAdoptionAdminDashboard } from "@/lib/adoption-admin-store";
import { parseOrganizationAdminFilters } from "@/lib/help-organization-admin-query";
import { getOrganizationAdminPage } from "@/lib/help-organization-admin-store";
import { parseHelpAdminFilters, isHelpAdminManagedCategory } from "@/lib/help-admin-query";
import { getManagedHelpDashboard } from "@/lib/help-store";
import { allHelpCategories } from "@/lib/help";
import { listAdminDogReports } from "@/lib/lost-found-dog-store";
import { dogReportStatusLabel, dogReportTypeShortLabel } from "@/lib/lost-found-dogs";

export const dynamic = "force-dynamic";

const workspaceCategories: HelpDirectoryCategory[] = [
  { slug: "adopcia", label: "Adopcie", icon: "🏠", href: "/admin/adopcie" },
  { slug: "stratene-a-najdene", label: "Stratené a nájdené", icon: "🔎", href: "/admin/stratene-najdene" },
  { slug: "organizacie", label: "Organizácie", icon: "🤝", href: "/admin/organizacie" },
  { slug: "ostatna-pomoc", label: "Ostatná pomoc", icon: "🐾", href: "/admin/pomoc" },
];
const organizationFilters = [
  { slug: "organizacie", label: "Všetky organizácie" },
  { slug: "utulky", label: "Iba útulky" },
];
const otherHelpFilters = [
  { slug: "ostatna-pomoc", label: "Všetky prípady" },
  ...allHelpCategories.filter(item => isHelpAdminManagedCategory(item.slug))
    .map(item => ({ slug: item.slug, label: item.label })),
];
type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";

async function loadTable(category: string, q: string, page: number) {
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
      inlineDog: { name: item.name, editable: item.status !== "ARCHIVED", kind: "adopcia" },
    }));
  } else if (category === "stratene-a-najdene") {
    const data = await listAdminDogReports({ q, page, pageSize: 50 });
    total = data.total; pages = data.pages; currentPage = data.page;
    rows = data.items.map(item => ({
      id: item.id, title: item.dogName || item.breed || "Hlásenie #" + item.id,
      detail: dogReportTypeShortLabel(item.type), category, status: dogReportStatusLabel[item.status],
      city: item.city, updatedAt: item.updatedAt, href: "/admin/stratene-najdene/" + item.id,
      inlineDog: { name: item.dogName ?? "", editable: item.status !== "ARCHIVED" && item.duplicateOfId === null,
        kind: "stratene-a-najdene" },
    }));
  } else if (category === "utulky" || category === "organizacie") {
    const data = await getOrganizationAdminPage(parseOrganizationAdminFilters({ get: key =>
      key === "q" ? q : key === "page" ? String(page) : key === "type" && category === "utulky" ? "SHELTER" : null,
    }));
    total = data.pagination.total; pages = data.pagination.totalPages; currentPage = data.pagination.page;
    rows = data.items.map(item => ({
      id: item.id, title: item.name, detail: item.type, category,
      status: item.status === "PUBLISHED" ? "Publikované" : item.status === "DRAFT" ? "Koncept" : "Archivované",
      city: item.primaryCity || item.city, updatedAt: item.updatedAt, href: "/admin/organizacie/" + item.id,
      inline: {
        name: item.name,
        shortDescription: item.shortDescription,
        publicEmail: item.publicEmail,
        publicPhone: item.publicPhone,
        websiteUrl: item.websiteUrl,
        editable: item.status !== "ARCHIVED" && !item.archivedAt,
      },
    }));
  } else {
    const data = await getManagedHelpDashboard(parseHelpAdminFilters({ get: key =>
      key === "category" ? (category === "ostatna-pomoc" ? null : category) : key === "q" ? q : key === "page" ? String(page) : null,
    }));
    total = data.resultCount; pages = data.pages; currentPage = data.page;
    rows = data.items.map(item => ({
      id: item.id, title: item.title,
      detail: [allHelpCategories.find(entry => entry.slug === item.category)?.label || item.category,
        item.organization || item.dogName].filter(Boolean).join(" · "),
      category: item.category, status: item.resolved ? "Vybavené" : item.status === "published" ? "Publikované" : "Koncept",
      city: item.city, updatedAt: item.updatedAt, href: "/admin/pomoc/" + item.id,
      inlineHelp: { title: item.title, excerpt: item.excerpt, editable: true },
    }));
  }
  return { rows, total, pages, page: currentPage };
}

async function HelpTable({ promise, category, q }: {
  promise: ReturnType<typeof loadTable>;
  category: string;
  q: string;
}) {
  const table = await promise;
  const returnQuery = new URLSearchParams({ category });
  if (q) returnQuery.set("q", q);
  if (table.page > 1) returnQuery.set("page", String(table.page));
  const returnHref = "/admin/pomoc-psom?" + returnQuery.toString();
  const isOrganizationView = category === "organizacie" || category === "utulky";
  const isOtherHelpView = category === "ostatna-pomoc" || isHelpAdminManagedCategory(category);
  return <AdminHelpUnifiedTable
    category={category}
    categories={workspaceCategories}
    filterOptions={isOrganizationView ? organizationFilters : isOtherHelpView ? otherHelpFilters : []}
    rows={table.rows.map(row => ({ ...row, href: adminDetailHref(row.href, returnHref) }))}
    query={q}
    page={table.page}
    pages={table.pages}
    total={table.total}
  />;
}

export default async function AdminDogHelpPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin/pomoc-psom");
  const raw = await searchParams;
  const requested = first(raw.category);
  // Legacy subcategory URLs remain valid and show the correct four-tab workspace.
  const category = requested === "organizacie" || requested === "ostatna-pomoc" ||
    allHelpCategories.some(item => item.slug === requested) ? requested : "adopcia";
  const q = first(raw.q).trim().slice(0, 80);
  const page = Math.min(100_000, Math.max(1, Number.parseInt(first(raw.page) || "1", 10) || 1));
  const tablePromise = loadTable(category, q, page);

  return (
    <AdminShell user={user} eyebrow="Profily" title="Profily – adopcie, hlásenia a organizácie"
      description="Vyber typ profilu. Každá kategória má vlastné údaje a editor; všetky patria do pracoviska Profily.">
      <AdminProfileTypeTabs active={category} />
      <Suspense fallback={<AdminDataLoading label="Pomoc psom" />}>
        <HelpTable promise={tablePromise} category={category} q={q} />
      </Suspense>
    </AdminShell>
  );
}
