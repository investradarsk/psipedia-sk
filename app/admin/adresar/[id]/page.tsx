import Link from "next/link";
import {env} from "cloudflare:workers";
import {AdminServiceProfileValues} from "@/components/admin-service-profile-values";
import {listAdminCatalogOptions} from "@/lib/service-catalog-admin-store";
import {catalogEditorItems,eligibleProfileServiceItems} from "@/lib/service-catalog-admin-editor-view";
import {serviceFilterCategories,type ServiceFilterCategory} from "@/lib/directory-filter-contract";
import { notFound } from "next/navigation";
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

  // Independent canonical Services V3 editor; no legacy source-data inference.
  const isServiceCategory = (serviceFilterCategories as readonly string[]).includes(profile.category);
  const bindings = env as unknown as {DB?: D1Database;SERVICE_CATALOG_ADMIN_WRITES_ENABLED?:string;SERVICE_CATALOG_NOTION_MIRROR_READY?:string};
  const writeEnabled = bindings.SERVICE_CATALOG_ADMIN_WRITES_ENABLED === "true"
    && bindings.SERVICE_CATALOG_NOTION_MIRROR_READY === "true";
  let serviceEntries:ReturnType<typeof eligibleProfileServiceItems>=[];
  let serviceChoices:Array<{optionId:string;choice:"yes"|"no";version:number}>=[];
  let serviceError:string|null=null;
  if(isServiceCategory) {
    if(!bindings.DB) serviceError="D1 nie je dostupná. Hodnoty Services V3 sa nenačítali.";
    else {
      try {
        const [dynamic, stored] = await Promise.all([
          listAdminCatalogOptions(bindings.DB),
          bindings.DB.prepare("SELECT option_id AS optionId,choice,version FROM service_profile_option_choices WHERE profile_id=?1")
            .bind(profile.id).all<{optionId:string;choice:"yes"|"no";version:number}>(),
        ]);
        serviceEntries=eligibleProfileServiceItems(catalogEditorItems(dynamic),profile.category as ServiceFilterCategory);
        serviceChoices=stored.results;
      } catch {
        serviceError="Kanonické hodnoty Services V3 sa nepodarilo načítať. Nič sa automaticky nenastavilo na Nie.";
      }
    }
  }
  return <AdminShell user={user} eyebrow={profile.status === "published" ? "Publikovaný profil" : profile.status === "archived" ? "Archivovaný profil" : "Koncept profilu"} title={profile.status === "archived" ? "Archivovaný profil" : "Upraviť profil"} description={profile.status === "archived" ? "Archivovaný profil je mimo verejného webu. Obnov ho do konceptu, ak ho chceš znovu upravovať." : "Zmeny ulož ako koncept alebo ich rovno publikuj v adresári."} actions={<><Link href="/admin/adresar">← Späť na adresár</Link>{profile.status === "published" && <Link href={directoryProfileHref(profile)} target="_blank" rel="noreferrer">Otvoriť verejný profil ↗</Link>}</>}><AdminGeminiOriginBadge agenda="directory" entityId={profile.id} /><AdminCanonicalDraftWarning warning={duplicateWarning} /><AdminDirectoryEditor profile={profile} automationSuggestions={automationSuggestions} />{isServiceCategory && <AdminServiceProfileValues key={profile.id} profileId={profile.id} entries={serviceEntries} initialChoices={serviceChoices} writeEnabled={writeEnabled && profile.status !== "archived"} error={serviceError} />}
  <AdminGeoLocation targetType="DIRECTORY_PROFILE" targetId={profile.id} />{profile.status === "draft" && <AdminCanonicalDraftDelete entityType="DIRECTORY" canonicalEntityId={profile.id} returnHref="/admin/adresar" />}</AdminShell>;
}
