import { notFound } from "next/navigation";
import { AdminDirectoryEditor } from "@/components/admin-directory-editor";
import { AdminGeoLocation } from "@/components/admin-geo-location";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getManagedDirectoryProfileById } from "@/lib/directory-store";
import { geoSensitiveDirectoryCategory } from "@/lib/geo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function EditDirectoryProfilePage({ params }: Props) {
  const { id: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  const user = await requireAdminPageUser(`/admin/adresar/${rawId}`);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const profile = await getManagedDirectoryProfileById(id);
  if (!profile) notFound();
  return <AdminShell user={user} eyebrow={profile.status === "published" ? "Publikovaný profil" : profile.status === "archived" ? "Archivovaný profil" : "Koncept profilu"} title={profile.status === "archived" ? "Archivovaný profil" : "Upraviť profil"} description={profile.status === "archived" ? "Archivovaný profil je mimo verejného webu. Obnov ho do konceptu, ak ho chceš znovu upravovať." : "Zmeny ulož ako koncept alebo ich rovno publikuj v adresári."}><AdminDirectoryEditor profile={profile} /><AdminGeoLocation targetType="DIRECTORY_PROFILE" targetId={profile.id} sensitive={geoSensitiveDirectoryCategory(profile.category)} /></AdminShell>;
}
