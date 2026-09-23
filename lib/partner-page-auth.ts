import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {getPartnerSession} from "./partner-auth";
import {PARTNER_SESSION_COOKIE} from "./partner-auth-store";
import {normalizePartnerReturnTo, partnerAuthHref} from "./partner-return-to";

export async function requirePartnerPageIdentity(
  options: { allowIncompleteOnboarding?: boolean; returnTo?: unknown } = {},
) {
  const returnTo = normalizePartnerReturnTo(options.returnTo);
  const jar = await cookies();
  const identity = await getPartnerSession({token:jar.get(PARTNER_SESSION_COOKIE)?.value});
  if (!identity) redirect(partnerAuthHref("/partner/prihlasenie", returnTo));
  if (!options.allowIncompleteOnboarding && !identity.onboardingComplete) {
    redirect(returnTo ? `/partner/onboarding?returnTo=${encodeURIComponent(returnTo)}` : "/partner/onboarding");
  }
  return identity;
}
