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
 * All Partner draft kinds have stable URL paths, not query-only state.
 * The server must never silently change a requested event/adoption/lost dog
 * into a directory profile when Vinext loses query params during redirects.
 */
const canonicalKinds = {
  adresar: "DIRECTORY_PROFILE",
  organizacia: "HELP_ORGANIZATION",
  podujatie: "MANAGED_EVENT",
  adopcia: "ADOPTION_DOG",
  pomoc: "HELP_CASE",
  strateny: "LOST_FOUND_DOG",
  najdeny: "LOST_FOUND_DOG",
  nahlasit: "LOST_FOUND_DOG",
} as const;

export default async function NewPartnerDraftPage({ params }: Props) {
  const { kind } = await params;
  const initialType = canonicalKinds[kind as keyof typeof canonicalKinds];
  if (!initialType) notFound();
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
        initialType={initialType}
        initialReportType={reportType}
      />
    </PartnerShell>
  );
}
