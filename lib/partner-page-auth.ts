import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {getPartnerSession} from "./partner-auth";
import {PARTNER_SESSION_COOKIE} from "./partner-auth-store";

export async function requirePartnerPageIdentity(
  options: { allowIncompleteOnboarding?: boolean } = {},
) {
  const jar = await cookies();
  const identity = await getPartnerSession({token:jar.get(PARTNER_SESSION_COOKIE)?.value});
  if (!identity) redirect("/partner/prihlasenie");
  if (!options.allowIncompleteOnboarding && !identity.onboardingComplete) {
    redirect("/partner/onboarding");
  }
  return identity;
}
