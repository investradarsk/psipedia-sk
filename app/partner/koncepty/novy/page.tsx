import Link from "next/link";
import { PartnerCanonicalDraftForm } from "@/components/partner-canonical-draft-form";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { directoryCategories } from "@/lib/directory";

export const dynamic="force-dynamic";
export default async function Page(){
  await requirePartnerPageIdentity();
  return <PartnerShell title="Vytvoriť nový záznam"
    description="Uložte si neverejný koncept alebo ho odošlite na prvé schválenie.">
    <p><Link href="/partner">← Späť na moje profily</Link></p>
    <PartnerCanonicalDraftForm categories={directoryCategories.map(({slug,label})=>({slug,label}))}/>
  </PartnerShell>;
}
