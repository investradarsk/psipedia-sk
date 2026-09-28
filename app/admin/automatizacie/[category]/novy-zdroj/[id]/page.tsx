import { notFound, redirect } from "next/navigation";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { automationCategoryBySlug } from "@/lib/admin-automation-presentation";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string; id: string }> };

export default async function LegacyAutomationCandidatePage({ params }: Props) {
  const { category } = await params;
  if (!automationCategoryBySlug(category)) notFound();
  await requireAdminPageUser("/admin/automatizacie/" + category);
  redirect("/admin/automatizacie/" + category + "#nove-zdroje");
}
