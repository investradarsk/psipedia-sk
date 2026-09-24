import { PartnerGoogleReturnNavigation } from "@/components/partner-google-return-navigation";
import { normalizePartnerReturnTo } from "@/lib/partner-return-to";

export const dynamic = "force-dynamic";

export default async function PartnerGoogleReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string | string[] }>;
}) {
  const raw = await searchParams;
  const target = normalizePartnerReturnTo(typeof raw.to === "string" ? raw.to : null) ?? "/partner";

  return (
    <main id="obsah" className="partner-shell partner-shell--centered">
      <section className="partner-verification-card">
        <span className="eyebrow">Partner Psipedia</span>
        <h1>Dokončujem prihlásenie…</h1>
        <p>Bezpečne vás presúvame späť do Partner účtu.</p>
        <PartnerGoogleReturnNavigation target={target} />
      </section>
    </main>
  );
}
