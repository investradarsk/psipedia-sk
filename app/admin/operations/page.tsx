import { AdminAttentionQueue } from "@/components/admin-attention-queue";
import { AdminShell } from "@/components/admin-shell";
import {
  filterAdminAttentionItems,
  isAdminAttentionPriority,
  isAdminAttentionSourceType,
  type AdminAttentionFilters,
} from "@/lib/admin-attention-queue";
import { loadAdminAttentionQueue } from "@/lib/admin-attention-queue-store";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export default async function AdminOperationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin/operations");
  const raw = await searchParams;
  const source = first(raw.source);
  const priority = first(raw.priority);
  const filters: AdminAttentionFilters = {
    sourceType: isAdminAttentionSourceType(source) ? source : "all",
    priority: isAdminAttentionPriority(priority) ? priority : "all",
  };
  const allItems = await loadAdminAttentionQueue();
  const items = filterAdminAttentionItems(allItems, filters);

  return (
    <AdminShell
      user={user}
      eyebrow="Admin Operations"
      title="Operácie"
      description="Read-only prehľad toho, čo dnes potrebuje pozornosť administrátora. Položky sa načítavajú priamo z existujúcich workflowov; spracovanie vždy pokračuje v ich pôvodnej administrácii."
    >
      <AdminAttentionQueue items={items} allItems={allItems} filters={filters} />
    </AdminShell>
  );
}
