"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { PartnerLogoutButton } from "@/components/partner-logout-button";

const records = [
  ["/partner/profily", "Moje profily"],
  ["/partner/podujatia", "Moje podujatia"],
  ["/partner/pomoc/nova", "Pomoc psom"],
] as const;
const requests = [
  ["/partner/ziadosti", "Žiadosti a zmeny"],
  ["/partner/prevziat", "Požiadať o správu"],
] as const;

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function PartnerWorkspaceNavigation() {
  const pathname = usePathname();
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const active = (href: string) => href === "/partner" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  const link = (href: string, label: string) => (
    <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} onClick={(event) => {
      setExpanded(false);
      event.currentTarget.closest("details")?.removeAttribute("open");
    }}>
      {label}
    </Link>
  );

  return (
    <header className="partner-dashboard-header">
      <button type="button" className="partner-nav-toggle" aria-controls={id} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        Partnerské menu <Chevron />
      </button>
      <nav key={pathname} id={id} className="partner-workspace-nav" aria-label="Partner navigácia" data-expanded={expanded}>
        {link("/partner", "Prehľad")}
        <details>
          <summary data-active={records.some(([href]) => active(href)) || pathname.startsWith("/partner/koncepty") ? "true" : undefined}>
            Moje záznamy <Chevron />
          </summary>
          <div className="partner-nav-group">{records.map(([href, label]) => link(href, label))}</div>
        </details>
        <details>
          <summary data-active={requests.some(([href]) => active(href)) ? "true" : undefined}>
            Žiadosti <Chevron />
          </summary>
          <div className="partner-nav-group">{requests.map(([href, label]) => link(href, label))}</div>
        </details>
        {link("/partner/spravy", "Správy")}
        {link("/partner/propagacia", "Propagácia")}
        <Link className="partner-nav-icon" href="/partner/upozornenia" aria-label="Upozornenia" title="Upozornenia" aria-current={active("/partner/upozornenia") ? "page" : undefined} onClick={() => setExpanded(false)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
          </svg>
        </Link>
        <details className="partner-nav-account">
          <summary data-active={active("/partner/nastavenia") ? "true" : undefined}>
            Môj účet <Chevron />
          </summary>
          <div className="partner-nav-group">
            {link("/partner/nastavenia", "Nastavenia")}
            <PartnerLogoutButton />
          </div>
        </details>
      </nav>
    </header>
  );
}
