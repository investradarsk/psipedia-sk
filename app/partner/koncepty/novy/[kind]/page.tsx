import { notFound } from "next/navigation";
import Link from "next/link";
import { PartnerCanonicalDraftForm } from "@/components/partner-canonical-draft-form";
import { PartnerShell } from "@/components/partner-shell";
import { getPartnerCanonicalFormFields } from "@/lib/partner-canonical-form-fields";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { directoryCategories } from "@/lib/directory";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ kind: string }> };

/**
 * Encode the report kind in the pathname, not the query string. Some Vinext
 * redirects can render the query-based entry with default searchParams,
 * silently turning a LOST/FOUND report into a directory profile.
 */
export default async function NewLostFoundReportPage({ params }: Props) {
  const { kind } = await params;
  if (kind !== "strateny" && kind !== "najdeny" && kind !== "nahlasit") notFound();
  const reportType = kind === "strateny" ? "LOST"
    : kind === "najdeny" ? "FOUND" : undefined;
  await requirePartnerPageIdentity({ returnTo: `/partner/koncepty/novy/${kind}` });
  return (
    <PartnerShell title="Vytvoriť nový záznam"
      description="Uložte si neverejný koncept alebo ho odošlite na prvé schválenie.">
      <p><Link href="/partner">← Späť na moje profily</Link></p>
      <PartnerCanonicalDraftForm
        categories={directoryCategories.map(({ slug, label }) => ({ slug, label }))}
        definitions={getPartnerCanonicalFormFields()}
        initialType="LOST_FOUND_DOG"
        initialReportType={reportType}
      />
    </PartnerShell>
  );
}
