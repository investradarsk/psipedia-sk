import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAutomationSourceSettings } from "@/components/admin-automation-source-settings";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAutomationSourceAdmin } from "@/lib/data-automation-source-store";
import { automationCategoryBySlug, automationCategoryForSource } from "@/lib/admin-automation-presentation";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function AutomationSourceDetailPage({ params }: Props) {
  const rawId = (await params).id;
  const user = await requireAdminPageUser("/admin/automatizacie/zdroje/" + rawId);
  const id = Number.parseInt(rawId, 10);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const source = await getAutomationSourceAdmin(id).catch(() => null);
  if (!source) notFound();
  const categorySlug = automationCategoryForSource(source);
  const category = categorySlug ? automationCategoryBySlug(categorySlug) : null;

  return (
    <AdminShell user={user} eyebrow="Automatizácie" title={source.label} description={source.sourceUrl ?? "Schválený zdroj"}
      actions={<Link href={categorySlug ? "/admin/automatizacie/" + categorySlug : "/admin/automatizacie"}>← Späť na zdroje</Link>}>
      <AdminAutomationSourceSettings source={source} draftsHref={category?.draftsHref ?? "/admin"} />
    </AdminShell>
  );
}
