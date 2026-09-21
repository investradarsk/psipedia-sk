import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PARTNER_SESSION_COOKIE, readCookie, safePartnerReturnPath } from "@/lib/partner-auth-core";
import { getPartnerAccountBySessionToken, type PartnerAccount } from "@/lib/partner-store";

export function partnerSignInPath(returnTo = "/partner") {
  const safe = safePartnerReturnPath(returnTo);
  return `/partner/prihlasenie?return_to=${encodeURIComponent(safe)}`;
}

export async function getPartnerPageAccount(returnTo = "/partner"): Promise<PartnerAccount> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PARTNER_SESSION_COOKIE)?.value ?? null;
  const account = await getPartnerAccountBySessionToken(token);
  if (!account) redirect(partnerSignInPath(returnTo));
  return account;
}

export async function getPartnerApiAccount(request: Request) {
  const token = readCookie(request.headers.get("cookie"), PARTNER_SESSION_COOKIE);
  return getPartnerAccountBySessionToken(token);
}

export function unauthorizedPartnerResponse() {
  return Response.json({ error: "Prihlásenie vypršalo alebo nemáte oprávnenie." }, { status: 401 });
}
