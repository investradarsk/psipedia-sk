import { redirect } from "next/navigation";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
export const dynamic="force-dynamic";
export default async function Page(){
  await requirePartnerPageIdentity();
  redirect("/partner/koncepty/novy?typ=MANAGED_EVENT");
}
