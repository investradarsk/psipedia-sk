import { PublicHeading } from "@/components/public-heading";
import type { Metadata } from "next";
import Link from "next/link";
import { getOutreachVerificationContext } from "@/lib/outreach-store";
import { outreachPartnerClaimHref } from "@/lib/outreach";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Správa profilu cez Partner účet | Psipedia.sk",
  robots: { index: false, follow: false, nocache: true },
};

type Props = { params: Promise<{ token: string }> };

/** Legacy email tokens remain read-only so old links guide owners to Partner. */
export default async function OutreachVerificationPage({ params }: Props) {
  const token = (await params).token;
  const context = await getOutreachVerificationContext(token).catch(() => null);

  if (!context) {
    return (
      <main id="obsah" className="prose-page legal-page">
        <span className="eyebrow">Správa profilu</span>
        <PublicHeading role="page" as="h1">Odkaz už nie je platný</PublicHeading>
        <p>Odkaz mohol expirovať, byť použitý alebo zrušený. O správu profilu môžete požiadať cez Partner účet.</p>
        <p><Link href="/partner/registracia">Prejsť na Partner účet</Link></p>
      </main>
    );
  }

  return (
    <main id="obsah" className="prose-page legal-page">
      <span className="eyebrow">Správa verejných profilov</span>
      <PublicHeading role="page" as="h1">Spravujte svoj profil cez Partner účet</PublicHeading>
      <p className="lead">
        Tento odkaz bol poslaný na {context.maskedEmail}. Obsahuje iba profily priradené k tomuto osloveniu.
      </p>
      <p>
        Anonymné návrhy zmien už neprijímame. Ak ste majiteľ alebo oprávnený správca, požiadajte
        o prevzatie príslušného profilu cez Partner účet. Samotný e-mailový odkaz vám
        nepriznáva oprávnenie spravovať profil.
      </p>
      <ul>
        {context.entities.map((entity) => (
          <li key={entity.entityType + ":" + entity.entityId}>
            <strong>{entity.entityName}</strong>{" "}
            <Link href={outreachPartnerClaimHref(entity.entityType, entity.entityId)}>
              Požiadať o správu cez Partner účet
            </Link>
          </li>
        ))}
      </ul>
      <p>
        Ak už profil spravujete, pokračujte do{" "}
        <Link href="/partner/profily">svojho Partner účtu</Link>, kde môžete údaje upraviť.
      </p>
      <p>
        Ochrana osobných údajov: <Link href="/sukromie">viac informácií</Link>.
      </p>
    </main>
  );
}
