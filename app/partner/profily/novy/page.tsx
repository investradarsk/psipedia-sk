import Link from "next/link";
import { PartnerNewProfileForm } from "@/components/partner-new-profile-form";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { directoryCategories } from "@/lib/directory";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePartnerPageIdentity();
  return (
    <PartnerShell
      title="Pridať nový profil"
      description="Ak svoj profil na Psipedii ešte nemáte, odošlite návrh. Pred vytvorením skontrolujeme možné duplicity."
    >
      <section className="partner-new-profile-intro">
        <div>
          <span className="eyebrow">Nový profil</span>
          <h2>Najprv overte, či profil už neexistuje</h2>
          <p>Ak profil už na Psipedii existuje, použite „Spravujete tento profil?“ namiesto vytvárania duplikátu.</p>
        </div>
        <Link href="/adresar">Prehľadať adresár ↗</Link>
      </section>
      <PartnerNewProfileForm categories={directoryCategories.map(({slug,label})=>({slug,label}))} />
    </PartnerShell>
  );
}
