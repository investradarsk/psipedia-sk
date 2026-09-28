import type { Metadata } from "next";
import Link from "next/link";
import { OutreachUnsubscribeForm } from "@/components/outreach-unsubscribe-form";
import { getOutreachUnsubscribeContext } from "@/lib/outreach-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Odhlásenie z oslovení | Psipedia.sk",
  robots: { index: false, follow: false, nocache: true },
};

type Props = { params: Promise<{ token: string }> };

export default async function OutreachUnsubscribePage({ params }: Props) {
  const token = (await params).token;
  const context = await getOutreachUnsubscribeContext(token).catch(() => null);
  return (
    <main id="obsah" className="prose-page legal-page">
      <span className="eyebrow">Profilový outreach</span>
      <h1>Odhlásenie z ďalších oslovení</h1>
      {context ? (
        <>
          <p className="lead">Odhlásenie sa týka kontaktu {context.maskedEmail}.</p>
          <p>Po potvrdení Psipedia tento e-mail nebude používať na ďalší profilový verification/data-quality outreach.</p>
          <OutreachUnsubscribeForm token={token} />
        </>
      ) : (
        <p>Odhlasovací odkaz už nie je platný alebo bol použitý. Ak potrebujete pomoc, použite stránku <Link href="/opravy-a-podnety">Opravy a podnety</Link>.</p>
      )}
    </main>
  );
}
