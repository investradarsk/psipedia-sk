import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {getPartnerSession} from "./partner-auth";
import {PARTNER_SESSION_COOKIE} from "./partner-auth-store";
import {normalizePartnerReturnTo} from "./partner-return-to";

export async function requirePartnerPageIdentity(
  options: { allowIncompleteOnboarding?: boolean; returnTo?: unknown } = {},
) {
  const jar = await cookies();
  const identity = await getPartnerSession({token:jar.get(PARTNER_SESSION_COOKIE)?.value});
  if (!identity) redirect("/partner/prihlasenie");
  if (!options.allowIncompleteOnboarding && !identity.onboardingComplete) {
    const returnTo = normalizePartnerReturnTo(options.returnTo);
    redirect(returnTo ? `/partner/onboarding?returnTo=${encodeURIComponent(returnTo)}` : "/partner/onboarding");
  }
  return identity;
}
