import Link from "next/link";
import { notFound } from "next/navigation";
import { PartnerProfileEditForm } from "@/components/partner-profile-edit-form";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { getPartnerProfileEditor } from "@/lib/partner-profile-changes";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ resourceId: string }> }) {
  const identity = await requirePartnerPageIdentity();
  const { resourceId } = await params;
  let editor;
  try {
    editor = await getPartnerProfileEditor(identity.accountId, resourceId);
  } catch {
    notFound();
  }
  return (
    <PartnerShell
      title="Upraviť údaje"
      description="Navrhnite zmenu verejných údajov profilu. Zmeny sa publikujú až po moderátorskej kontrole."
    >
      <section className="partner-profile-editor">
        <div className="partner-section-heading">
          <div>
            <span className="eyebrow">{editor.resource.entityType === "DIRECTORY_PROFILE" ? "Adresár" : "Organizácia"}</span>
            <h2>{editor.resource.name}</h2>
          </div>
          <div className="partner-request-links">
            {editor.resource.publicHref ? <Link href={editor.resource.publicHref} target="_blank">Verejný profil ↗</Link> : null}
            <Link href="/partner/ziadosti">Moje žiadosti</Link>
          </div>
        </div>
        <PartnerProfileEditForm
          resourceId={editor.resource.resourceId}
          fields={editor.fields}
          values={editor.values}
          baseRevision={editor.baseRevision}
        />
      </section>
    </PartnerShell>
  );
}
