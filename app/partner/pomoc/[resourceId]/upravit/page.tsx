import Link from "next/link";
import { notFound } from "next/navigation";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { getPartnerHelpEditor, PartnerHelpEditorError } from "@/lib/partner-help-editor";
import { PartnerAuthorizationError } from "@/lib/partner-platform";
import { PartnerHelpPublicEditorForm } from "@/components/partner-help-public-editor-form";

export const dynamic = "force-dynamic";

export default async function Page({ params }: {params:Promise<{resourceId:string}>}) {
  const identity = await requirePartnerPageIdentity();
  const { resourceId } = await params;
  let editor;
  try { editor = await getPartnerHelpEditor(identity.accountId, resourceId); }
  catch(error) {
    if(error instanceof PartnerHelpEditorError || error instanceof PartnerAuthorizationError)notFound();
    throw error;
  }
  return <PartnerShell title="Upraviť záznam Pomoci psom"
    description="Verejné údaje svojho schváleného záznamu môžete upraviť. SEO, interné údaje a vlastníctvo zostávajú chránené.">
    <section className="partner-profile-editor">
      <div className="partner-section-heading"><div><span className="eyebrow">{editor.entityType === "ADOPTION_DOG"?"Adopcia":editor.entityType === "LOST_FOUND_DOG"?"Stratené a nájdené psy":"Pomoc psom"}</span><h2>{editor.title}</h2></div>
        <div className="partner-request-links"><Link href="/partner/profily">Moje profily</Link>{editor.publicHref?<Link href={editor.publicHref} target="_blank" rel="noopener noreferrer">Verejný záznam ↗</Link>:null}</div>
      </div>
      <PartnerHelpPublicEditorForm
        resourceId={editor.resourceId}
        entityType={editor.entityType}
        fields={editor.fields}
        originalValues={editor.values}
        initialRevision={editor.baseRevision}
        imageUrl={editor.imageUrl}
        gallery={editor.gallery}
      />
    </section>
  </PartnerShell>;
}
