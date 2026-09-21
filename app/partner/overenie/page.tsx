import { PartnerVerification } from "@/components/partner-verification";

type Props = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function PartnerVerificationPage({ searchParams }: Props) {
  const params = await searchParams;
  const rawToken = Array.isArray(params.token) ? params.token[0] : params.token;

  return (
    <main id="obsah" className="partner-shell partner-shell--centered">
      <PartnerVerification token={rawToken ?? ""} />
    </main>
  );
}
