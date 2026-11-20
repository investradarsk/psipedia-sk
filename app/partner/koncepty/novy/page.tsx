import { getPartnerCanonicalFormFields } from "@/lib/partner-canonical-form-fields";
import Link from "next/link";
import { PartnerCanonicalDraftForm } from "@/components/partner-canonical-draft-form";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { directoryCategories } from "@/lib/directory";

export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{typ?:string}>}){
  await requirePartnerPageIdentity();
  const {typ}=await searchParams;
  const initialType=(["DIRECTORY_PROFILE","HELP_ORGANIZATION","MANAGED_EVENT","ADOPTION_DOG","LOST_FOUND_DOG","HELP_CASE"].includes(typ??"")?typ:"DIRECTORY_PROFILE") as import("@/lib/partner-canonical-workflow").PartnerCanonicalType;
  return <PartnerShell title="Vytvoriť nový záznam"
    description="Uložte si neverejný koncept alebo ho odošlite na prvé schválenie.">
    <p><Link href="/partner">← Späť na moje profily</Link></p>
    <PartnerCanonicalDraftForm categories={directoryCategories.map(({slug,label})=>({slug,label}))} definitions={getPartnerCanonicalFormFields()} initialType={initialType}/>
  </PartnerShell>;
}
