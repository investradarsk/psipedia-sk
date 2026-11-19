import Link from "next/link";
import { PartnerHelpCreateForm } from "@/components/partner-help-create-form";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePartnerPageIdentity();
  return <PartnerShell title="Nový záznam Pomoci psom" description="Navrhnite adopciu, strateného či nájdeného psa alebo ďalšiu formu pomoci. Záznam sa nezverejní bez kontroly.">
    <section className="partner-new-profile-intro">
      <div><span className="eyebrow">Pomoc psom</span><h2>Najprv skontrolujte, či záznam neexistuje</h2>
        <p>Ak už na Psipedii existuje, <Link href="/partner/prevziat?type=ADOPTION_DOG">požiadajte o jeho správu</Link>. Nevytvárajte rovnaký profil druhýkrát.</p></div>
      <Link href="/pomoc-psom">Pozrieť Pomoc psom ↗</Link>
    </section>
    <PartnerHelpCreateForm/>
  </PartnerShell>;
}
