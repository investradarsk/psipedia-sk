import { PartnerVerification } from "@/components/partner-verification";
import { normalizePartnerReturnTo } from "@/lib/partner-return-to";

export default async function PartnerVerificationPage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const raw = await searchParams;
  const returnTo = normalizePartnerReturnTo(typeof raw.returnTo === "string" ? raw.returnTo : null);
  return (
    <main id="obsah" className="partner-shell partner-shell--centered">
      <PartnerVerification returnTo={returnTo} />
    </main>
  );
}
