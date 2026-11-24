import { getPartnerCanonicalFormFields } from "@/lib/partner-canonical-form-fields";
import Link from "next/link";
import { PartnerCanonicalDraftForm } from "@/components/partner-canonical-draft-form";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { directoryCategories } from "@/lib/directory";

export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{typ?:string;druh?:string}>}){
  const {typ,druh}=await searchParams;
  const initialType=(["DIRECTORY_PROFILE","HELP_ORGANIZATION","MANAGED_EVENT","ADOPTION_DOG","LOST_FOUND_DOG","HELP_CASE"].includes(typ??"")?typ:"DIRECTORY_PROFILE") as import("@/lib/partner-canonical-workflow").PartnerCanonicalType;
  const reportType=initialType==="LOST_FOUND_DOG"&&(druh==="LOST"||druh==="FOUND")?druh:null;
  // Preserve the exact validated destination across login, email link, Google and onboarding.
  const returnTo="/partner/koncepty/novy?typ="+encodeURIComponent(initialType)+
    (reportType?"&druh="+encodeURIComponent(reportType):"");
  await requirePartnerPageIdentity({returnTo});
  return <PartnerShell title="Vytvoriť nový záznam"
    description="Uložte si neverejný koncept alebo ho odošlite na prvé schválenie.">
    <p><Link href="/partner/profily">← Späť na moje profily</Link></p>
    <PartnerCanonicalDraftForm categories={directoryCategories.map(({slug,label})=>({slug,label}))} definitions={getPartnerCanonicalFormFields()} initialType={initialType} initialReportType={reportType??undefined}/>
  </PartnerShell>;
}
