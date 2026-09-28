import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAdoptionEditor } from "@/components/admin-adoption-editor";
import { AdminCanonicalDraftWarning } from "@/components/admin-canonical-draft-warning";
import { AdminCanonicalDraftDelete } from "@/components/admin-canonical-draft-delete";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { adoptionStatusLabels, type AdoptionStatus } from "@/lib/adoption";
import { listAdoptionAdminBreedOptions, listAdoptionAdminOrganizationOptions } from "@/lib/adoption-admin-write";
import { getAdoptionById } from "@/lib/adoption-store";
import { getCanonicalDraftDuplicateWarning } from "@/lib/canonical-draft-flags";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function EditAdoptionPage({ params }: Props) {
  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) notFound();
  const user = await requireAdminPageUser(`/admin/adopcie/${id}`);
  const [item, breeds, organizations] = await Promise.all([
    getAdoptionById(numericId),
    listAdoptionAdminBreedOptions(),
    listAdoptionAdminOrganizationOptions(),
  ]);
  if (!item) notFound();
  const duplicateWarning = await getCanonicalDraftDuplicateWarning("ADOPTION", item.id).catch(() => null);
  return <AdminShell user={user} eyebrow={adoptionStatusLabels[item.status as AdoptionStatus]} title={`Upraviť: ${item.name}`} description="Server pri každom uložení znovu validuje celý profil, lifecycle prechod aj canonical väzby." actions={<Link href="/admin/adopcie">← Späť na adopcie</Link>}><AdminCanonicalDraftWarning warning={duplicateWarning} /><AdminAdoptionEditor item={item} breeds={breeds} organizations={organizations}/>{item.status === "DRAFT" && <AdminCanonicalDraftDelete entityType="ADOPTION" canonicalEntityId={item.id} returnHref="/admin/adopcie" />}</AdminShell>;
}
