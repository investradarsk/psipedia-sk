import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminDirectoryEditor } from "@/components/admin-directory-editor";
import { AdminCanonicalDraftWarning } from "@/components/admin-canonical-draft-warning";
import { AdminCanonicalDraftDelete } from "@/components/admin-canonical-draft-delete";
import { AdminGeoLocation } from "@/components/admin-geo-location";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { directoryProfileHref } from "@/lib/directory";
import { getManagedDirectoryProfileById } from "@/lib/directory-store";
import { getCanonicalDraftDuplicateWarning } from "@/lib/canonical-draft-flags";
import { listCanonicalAutomationUpdateSuggestions } from "@/lib/data-automation-update-review";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function EditDirectoryProfilePage({ params }: Props) {
  const { id: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  const user = await requireAdminPageUser(`/admin/adresar/${rawId}`);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const profile = await getManagedDirectoryProfileById(id);
  if (!profile) notFound();
  const [duplicateWarning, automationSuggestions] = await Promise.all([
    getCanonicalDraftDuplicateWarning("DIRECTORY", profile.id).catch(() => null),
    listCanonicalAutomationUpdateSuggestions({ entityType: "DIRECTORY", canonicalEntityId: profile.id }),
  ]);
  return <AdminShell user={user} eyebrow={profile.status === "published" ? "Publikovaný profil" : profile.status === "archived" ? "Archivovaný profil" : "Koncept profilu"} title={profile.status === "archived" ? "Archivovaný profil" : "Upraviť profil"} description={profile.status === "archived" ? "Archivovaný profil je mimo verejného webu. Obnov ho do konceptu, ak ho chceš znovu upravovať." : "Zmeny ulož ako koncept alebo ich rovno publikuj v adresári."} actions={<><Link href="/admin/adresar">← Späť na adresár</Link>{profile.status === "published" && <Link href={directoryProfileHref(profile)} target="_blank" rel="noreferrer">Otvoriť verejný profil ↗</Link>}</>}><AdminCanonicalDraftWarning warning={duplicateWarning} /><AdminDirectoryEditor profile={profile} automationSuggestions={automationSuggestions} /><AdminGeoLocation targetType="DIRECTORY_PROFILE" targetId={profile.id} />{profile.status === "draft" && <AdminCanonicalDraftDelete entityType="DIRECTORY" canonicalEntityId={profile.id} returnHref="/admin/adresar" />}</AdminShell>;
}
