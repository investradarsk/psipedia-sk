import type { ReactNode } from "react";
import { PartnerWorkspaceNavigation } from "@/components/partner-workspace-navigation";

export function PartnerShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main id="obsah" className="partner-shell partner-shell--workspace">
      <PartnerWorkspaceNavigation />
      <section className="partner-page-heading">
        <span className="eyebrow">Partner Psipedia</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </section>
      {children}
    </main>
  );
}
