import Link from "next/link";
import type {ReactNode} from "react";
import { PartnerLogoutButton } from "@/components/partner-logout-button";

const links=[["/partner","Prehľad"],["/partner/profily","Moje profily"],["/partner/podujatia","Moje podujatia"],["/partner/ziadosti","Žiadosti a zmeny"],["/partner/propagacia","Propagácia"],["/partner/nastavenia","Nastavenia"]] as const;

export function PartnerShell({title,description,children}:{title:string;description:string;children:ReactNode}){
  return <main id="obsah" className="partner-shell">
    <header className="partner-dashboard-header">
      <Link href="/partner" className="partner-brand">Psipedia <span>Partner</span></Link>
      <nav aria-label="Partner navigácia">
        {links.map(([href,label])=><Link key={href} href={href}>{label}</Link>)}
        <PartnerLogoutButton />
      </nav>
    </header>
    <section className="partner-page-heading"><span className="eyebrow">Partner Psipedia</span><h1>{title}</h1><p>{description}</p></section>
    {children}
  </main>;
}
