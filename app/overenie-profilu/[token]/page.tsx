import type { Metadata } from "next";
import Link from "next/link";
import { OutreachVerificationForm } from "@/components/outreach-verification-form";
import { getOutreachVerificationContext } from "@/lib/outreach-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Kontrola profilu | Psipedia.sk",
  robots: { index: false, follow: false, nocache: true },
};

type Props = { params: Promise<{ token: string }> };

export default async function OutreachVerificationPage({ params }: Props) {
  const token = (await params).token;
  const context = await getOutreachVerificationContext(token).catch(() => null);

  if (!context) {
    return (
      <main id="obsah" className="prose-page legal-page">
        <span className="eyebrow">Kontrola profilu</span>
        <h1>Odkaz už nie je platný</h1>
        <p>Overovací odkaz mohol expirovať, byť použitý alebo zrušený.</p>
        <p>Ak nám chcete poslať opravu inak, použite stránku <Link href="/opravy-a-podnety">Opravy a podnety</Link>.</p>
      </main>
    );
  }

  return (
    <main id="obsah" className="prose-page legal-page">
      <span className="eyebrow">Kontrola verejných údajov</span>
      <h1>Skontrolujte svoj profil na Psipedia.sk</h1>
      <p className="lead">Tento odkaz bol poslaný na {context.maskedEmail}. Zobrazuje iba profily priradené ku konkrétnemu outreach príjemcovi.</p>
      <p>Navrhnuté zmeny najprv skontroluje redakcia. Kliknutie na odkaz nevytvára administrátorský účet ani nepotvrdzuje právne vlastníctvo profilu.</p>
      <OutreachVerificationForm token={token} entities={context.entities} />
      <p>Ochrana osobných údajov: <Link href="/sukromie">viac informácií</Link>.</p>
    </main>
  );
}
