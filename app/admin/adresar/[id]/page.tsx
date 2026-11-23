import { AdminPartnerCanonicalAudit } from "@/components/admin-partner-canonical-audit";
import Link from "next/link";
import { adminReturnHref } from "@/lib/admin-return-navigation";
import { Suspense } from "react";
import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { AdminServiceProfileValues } from "@/components/admin-service-profile-values";
import { listAdminCatalogOptions, ServiceCatalogSchemaError } from "@/lib/service-catalog-admin-store";
import { loadResolvedServiceDefinitions, type ResolvedServiceDefinition } from "@/lib/service-catalog-resolved";
import { listBuiltinCatalogOverrides } from "@/lib/service-catalog-builtin-overrides";
import { catalogEditorItems, eligibleProfileServiceItems } from "@/lib/service-catalog-admin-editor-view";
import { serviceFilterCategories, type ServiceFilterCategory } from "@/lib/directory-filter-contract";
import { loadServiceProfileMembership } from "@/lib/service-catalog-profile-membership";
import { AdminDirectoryEditor } from "@/components/admin-directory-editor";
import { AdminRecordViewStats } from "@/components/admin-record-view-stats";
import { AdminDirectoryNotionSyncStatus } from "@/components/admin-directory-notion-sync-status";
import { AdminCanonicalDraftWarning } from "@/components/admin-canonical-draft-warning";
import { AdminGeminiOriginBadge } from "@/components/admin-gemini-origin-badge";
import { AdminPartnerCanonicalDraft } from "@/components/admin-partner-canonical-draft";
import { AdminCanonicalDraftDelete } from "@/components/admin-canonical-draft-delete";
import { AdminGeoLocation } from "@/components/admin-geo-location";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { directoryProfileHref } from "@/lib/directory";
import { getManagedDirectoryProfileById } from "@/lib/directory-store";
import { getDirectoryPartnerOwnerAdmin } from "@/lib/partner-admin-store";
import { readDirectory0170EditorialFields } from "@/lib/directory-0170-editorial-read";
import { getCanonicalDraftDuplicateWarning } from "@/lib/canonical-draft-flags";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string | string[] }> };

async function DirectoryDuplicateWarning({ id }: { id: number }) {
  const warning = await getCanonicalDraftDuplicateWarning("DIRECTORY", id).catch(() => null);
  return <AdminCanonicalDraftWarning warning={warning} />;
}

async function DirectoryServiceValues({
  profileId, category, archived, legacyServices,
}: {
  profileId: number;
  category: ServiceFilterCategory;
  archived: boolean;
  legacyServices: readonly string[];
}) {
  // The Services V3 catalog is independent of the profile's base fields.
  // Stream it after the editor instead of blocking the first editable paint.
  const bindings = env as unknown as {
    DB?: D1Database;
    SERVICE_CATALOG_ADMIN_WRITES_ENABLED?: string;
    SERVICE_CATALOG_NOTION_MIRROR_READY?: string;
    SERVICE_CATALOG_PUBLIC_FILTERS_ENABLED?: string;
  };
  const database = bindings.DB;
  const writeEnabled = bindings.SERVICE_CATALOG_ADMIN_WRITES_ENABLED === "true";
  let serviceEntries: ReturnType<typeof eligibleProfileServiceItems> = [];
  let serviceChoices: Array<{ optionId: string; choice: "yes" | "no"; version: number }> = [];
  let resolvedServices: ResolvedServiceDefinition[] = [];
  let profileCategories: string[] = [category];
  let serviceError: string | null = null;

  if (!database) {
    serviceError = "D1 nie je dostupná. Hodnoty Services V3 sa nenačítali.";
  } else {
    try {
      const [membership, dynamic, overrides, stored, resolved] = await Promise.all([
        loadServiceProfileMembership(database, profileId),
        listAdminCatalogOptions(database),
        listBuiltinCatalogOverrides(database).catch((cause) => {
          if (cause instanceof ServiceCatalogSchemaError) return [];
          throw cause;
        }),
        database.prepare("SELECT option_id AS optionId,choice,version FROM service_profile_option_choices WHERE profile_id=?1")
          .bind(profileId).all<{ optionId: string; choice: "yes" | "no"; version: number }>(),
        loadResolvedServiceDefinitions(database),
      ]);
      if (!membership) throw new Error("Services V3 profile missing");
      profileCategories = [...membership.categories];
      serviceEntries = eligibleProfileServiceItems(catalogEditorItems(dynamic, overrides), profileCategories);
      serviceChoices = stored.results;
      resolvedServices = resolved;
    } catch {
      serviceError = "Kanonické hodnoty Services V3 sa nepodarilo načítať. Nič sa automaticky nenastavilo na Nie.";
    }
  }

  return <AdminServiceProfileValues key={profileId} profileId={profileId} categories={profileCategories}
    entries={serviceEntries} initialChoices={serviceChoices} resolvedServices={resolvedServices}
    legacyServices={legacyServices} publicProjectionEnabled={bindings.SERVICE_CATALOG_PUBLIC_FILTERS_ENABLED === "true"}
    writeEnabled={writeEnabled && !archived} error={serviceError} />;
}

export default async function EditDirectoryProfilePage({ params, searchParams }: Props) {
  const returnHref = adminReturnHref((await searchParams).returnTo, ["/admin/adresar", "/admin/sluzby-pre-psov"]);
  const { id: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const user = await requireAdminPageUser(`/admin/adresar/${rawId}`);

  // Do not open an editable form with stale legacy values if the SQL-first
  // editorial read fails. Leave the record untouched and show a clear error.
  const canonicalProfile = await getManagedDirectoryProfileById(id);
  if (!canonicalProfile) notFound();
  const db = (env as unknown as { DB?: D1Database }).DB;
  let editorialReadError = !db;
  let partnerOwnershipUnavailable = !db;
  let partnerOwner: Awaited<ReturnType<typeof getDirectoryPartnerOwnerAdmin>> = null;
  let profile = canonicalProfile;
  if (db) {
    try {
      partnerOwner = await getDirectoryPartnerOwnerAdmin(id, { database: db });
    } catch (error) {
      partnerOwnershipUnavailable = true;
      console.error("ADMIN_DIRECTORY_PARTNER_OWNER_READ_FAILED", id,
        error instanceof Error ? error.message : String(error));
    }
  }
  if (db) {
    try {
      const importData=await readDirectory0170EditorialFields(db,{
        profileId:id,category:canonicalProfile.category,
        source:canonicalProfile.importData,audience:"admin",
      });
      profile={...canonicalProfile,importData};
    } catch {
      editorialReadError=true;
    }
  }

  const isServiceCategory = [profile.category,...(profile.additionalCategories ?? [])]
    .some(category => (serviceFilterCategories as readonly string[]).includes(category));
  return <AdminShell recordId={profile.id} user={user}
    eyebrow={profile.status === "published" ? "Publikovaný profil" : profile.status === "archived" ? "Archivovaný profil" : "Koncept profilu"}
    title={profile.status === "archived" ? "Archivovaný profil" : "Upraviť profil"}
    description={profile.status === "archived"
      ? "Archivovaný profil je mimo verejného webu. Obnov ho do konceptu, ak ho chceš znovu upravovať."
      : "Zmeny ulož ako koncept alebo ich rovno publikuj v adresári."}
    actions={<>
      <Link href={returnHref}>← Späť na adresár</Link>
      {profile.status === "published" && <Link href={directoryProfileHref(profile)} target="_blank" rel="noreferrer">Otvoriť verejný profil ↗</Link>}
    </>}>
    <Suspense fallback={null}><AdminPartnerCanonicalDraft resourceType="DIRECTORY_PROFILE" canonicalId={profile.id} /></Suspense>
    <Suspense fallback={null}><AdminPartnerCanonicalAudit resourceType="DIRECTORY_PROFILE" canonicalId={profile.id} /></Suspense>
    <AdminGeminiOriginBadge agenda="directory" entityId={profile.id} />
    <Suspense fallback={null}><DirectoryDuplicateWarning id={profile.id} /></Suspense>
    <Suspense fallback={null}>
      <AdminRecordViewStats entityType="DIRECTORY_PROFILE" entityId={profile.id} />
    </Suspense>
    {editorialReadError
      ? <p role="alert">Kanonické SQL údaje profilu sa nepodarilo načítať. Formulár nie je dostupný; údaje sa nezmenili.</p>
      : <AdminDirectoryEditor profile={profile} returnHref={returnHref}
          partnerOwner={partnerOwner} partnerOwnershipUnavailable={partnerOwnershipUnavailable} />}
    <Suspense fallback={null}><AdminDirectoryNotionSyncStatus profileId={profile.id} /></Suspense>
    {isServiceCategory && !editorialReadError && <Suspense fallback={<p role="status">Načítavam hodnoty služieb…</p>}>
      <DirectoryServiceValues profileId={profile.id} category={profile.category as ServiceFilterCategory}
        archived={profile.status === "archived"} legacyServices={profile.services} />
    </Suspense>}
    <AdminGeoLocation targetType="DIRECTORY_PROFILE" targetId={profile.id} />
    {profile.status === "draft" && <AdminCanonicalDraftDelete entityType="DIRECTORY" canonicalEntityId={profile.id} returnHref={returnHref} />}
  </AdminShell>;
}
