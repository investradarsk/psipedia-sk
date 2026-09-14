import { notFound } from "next/navigation";
import { AdminAdoptionEditor } from "@/components/admin-adoption-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { adoptionStatusLabels, type AdoptionStatus } from "@/lib/adoption";
import { listAdoptionAdminBreedOptions } from "@/lib/adoption-admin-write";
import { getAdoptionById } from "@/lib/adoption-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function EditAdoptionPage({ params }: Props) {
  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) notFound();
  const user = await requireAdminPageUser(`/admin/adopcie/${id}`);
  const [item, breeds] = await Promise.all([getAdoptionById(numericId), listAdoptionAdminBreedOptions()]);
  if (!item) notFound();
  return <AdminShell user={user} eyebrow={adoptionStatusLabels[item.status as AdoptionStatus]} title={`Upraviť: ${item.name}`} description="Server pri každom uložení znovu validuje celý profil, lifecycle prechod aj väzbu na plemeno."><AdminAdoptionEditor item={item} breeds={breeds}/></AdminShell>;
}
