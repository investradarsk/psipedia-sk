import Link from "next/link";
import { Suspense } from "react";
import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { AdminServiceProfileValues } from "@/components/admin-service-profile-values";
import { listAdminCatalogOptions, ServiceCatalogSchemaError } from "@/lib/service-catalog-admin-store";
import { listBuiltinCatalogOverrides } from "@/lib/service-catalog-builtin-overrides";
import { catalogEditorItems, eligibleProfileServiceItems } from "@/lib/service-catalog-admin-editor-view";
import { serviceFilterCategories, type ServiceFilterCategory } from "@/lib/directory-filter-contract";
import { AdminDirectoryEditor } from "@/components/admin-directory-editor";
import { AdminCanonicalDraftWarning } from "@/components/admin-canonical-draft-warning";
import { AdminGeminiOriginBadge } from "@/components/admin-gemini-origin-badge";
import { AdminCanonicalDraftDelete } from "@/components/admin-canonical-draft-delete";
import { AdminGeoLocation } from "@/components/admin-geo-location";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { directoryProfileHref } from "@/lib/directory";
import { getManagedDirectoryProfileById } from "@/lib/directory-store";
import { getCanonicalDraftDuplicateWarning } from "@/lib/canonical-draft-flags";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

async function DirectoryDuplicateWarning({ id }: { id: number }) {
  const warning = await getCanonicalDraftDuplicateWarning("DIRECTORY", id).catch(() => null);
  return <AdminCanonicalDraftWarning warning={warning} />;
}

async function DirectoryServiceValues({
  profileId, category, archived,
}: {
  profileId: number;
  category: ServiceFilterCategory;
  archived: boolean;
}) {
  // The Services V3 catalog is independent of the profile's base fields.
  // Stream it after the editor instead of blocking the first editable paint.
  const bindings = env as unknown as {
    DB?: D1Database;
    SERVICE_CATALOG_ADMIN_WRITES_ENABLED?: string;
    SERVICE_CATALOG_NOTION_MIRROR_READY?: string;
  };
  const database = bindings.DB;
  const writeEnabled = bindings.SERVICE_CATALOG_ADMIN_WRITES_ENABLED === "true";
  let serviceEntries: ReturnType<typeof eligibleProfileServiceItems> = [];
  let serviceChoices: Array<{ optionId: string; choice: "yes" | "no"; version: number }> = [];
  let serviceError: string | null = null;

  if (!database) {
    serviceError = "D1 nie je dostupná. Hodnoty Services V3 sa nenačítali.";
  } else {
    try {
      const [dynamic, overrides, stored] = await Promise.all([
        listAdminCatalogOptions(database),
        listBuiltinCatalogOverrides(database).catch((cause) => {
          if (cause instanceof ServiceCatalogSchemaError) return [];
          throw cause;
        }),
        database.prepare("SELECT option_id AS optionId,choice,version FROM service_profile_option_choices WHERE profile_id=?1")
          .bind(profileId).all<{ optionId: string; choice: "yes" | "no"; version: number }>(),
      ]);
      serviceEntries = eligibleProfileServiceItems(catalogEditorItems(dynamic, overrides), category);
      serviceChoices = stored.results;
    } catch {
      serviceError = "Kanonické hodnoty Services V3 sa nepodarilo načítať. Nič sa automaticky nenastavilo na Nie.";
    }
  }

  return <AdminServiceProfileValues key={profileId} profileId={profileId} entries={serviceEntries}
    initialChoices={serviceChoices} writeEnabled={writeEnabled && !archived} error={serviceError} />;
}

export default async function EditDirectoryProfilePage({ params }: Props) {
  const { id: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const user = await requireAdminPageUser(`/admin/adresar/${rawId}`);

  // Only the canonical profile is required to open the primary form.
  const profile = await getManagedDirectoryProfileById(id);
  if (!profile) notFound();

  const isServiceCategory = (serviceFilterCategories as readonly string[]).includes(profile.category);
  return <AdminShell recordId={profile.id} recordKind="directory" recordCategory={profile.category} user={user}
    eyebrow={profile.status === "published" ? "Publikovaný profil" : profile.status === "archived" ? "Archivovaný profil" : "Koncept profilu"}
    title={profile.status === "archived" ? "Archivovaný profil" : "Upraviť profil"}
    description={profile.status === "archived"
      ? "Archivovaný profil je mimo verejného webu. Obnov ho do konceptu, ak ho chceš znovu upravovať."
      : "Zmeny ulož ako koncept alebo ich rovno publikuj v adresári."}
    actions={<>
      <Link href="/admin/adresar">← Späť na adresár</Link>
      {profile.status === "published" && <Link href={directoryProfileHref(profile)} target="_blank" rel="noreferrer">Otvoriť verejný profil ↗</Link>}
    </>}>
    <AdminGeminiOriginBadge agenda="directory" entityId={profile.id} />
    <Suspense fallback={null}><DirectoryDuplicateWarning id={profile.id} /></Suspense>
    <AdminDirectoryEditor profile={profile} />
    {isServiceCategory && <Suspense fallback={<p role="status">Načítavam hodnoty služieb…</p>}>
      <DirectoryServiceValues profileId={profile.id} category={profile.category as ServiceFilterCategory}
        archived={profile.status === "archived"} />
    </Suspense>}
    <AdminGeoLocation targetType="DIRECTORY_PROFILE" targetId={profile.id} />
    {profile.status === "draft" && <AdminCanonicalDraftDelete entityType="DIRECTORY" canonicalEntityId={profile.id} returnHref="/admin/adresar" />}
  </AdminShell>;
}
