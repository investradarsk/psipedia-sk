import { requirePartnerAccount } from "@/lib/partner-auth";
import { PartnerGoogleAuthError, startPartnerGoogleFlow } from "@/lib/partner-google-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const intent = url.searchParams.get("intent");
    let accountId: string | null = null;
    if (intent === "LINK") {
      const identity = await requirePartnerAccount({
        cookieHeader: request.headers.get("cookie"),
        allowIncompleteOnboarding: true,
      });
      accountId = identity.accountId;
    }
    const result = await startPartnerGoogleFlow({
      intent,
      returnTo: url.searchParams.get("returnTo"),
      accountId,
    });
    return new Response(null, {
      status: 303,
      headers: {
        Location: result.location,
        "Set-Cookie": result.cookie,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const status = error instanceof PartnerGoogleAuthError ? error.status : 503;
    if (!(error instanceof PartnerGoogleAuthError)) {
      console.error(JSON.stringify({ event: "partner_google_start", result: "failed", error: error instanceof Error ? error.name : "unknown_error" }));
    }
    const location = status === 401 ? "/partner/prihlasenie" : "/partner/prihlasenie?google=unavailable";
    return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "private, no-store" } });
  }
}
