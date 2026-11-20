import Link from "next/link";
import { PartnerShell } from "@/components/partner-shell";
import { PartnerPrivateChat } from "@/components/partner-private-chat";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { listPartnerChat } from "@/lib/partner-chat";
export const dynamic="force-dynamic";
export default async function Page(){
  const identity=await requirePartnerPageIdentity();
  const messages=await listPartnerChat({accountId:identity.accountId});
  return <PartnerShell title="Správy" description="Súkromný rozhovor s administrátorom Psipedie.">
    <p><Link href="/partner">← Moje profily</Link></p>
    <PartnerPrivateChat mode="PARTNER" initial={messages}/>
  </PartnerShell>;
}
