import {
  PartnerGoogleAuthError,
  clearPartnerGoogleFlowCookie,
  handlePartnerGoogleCallback,
} from "@/lib/partner-google-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await handlePartnerGoogleCallback({
      request,
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
    });
    const headers = new Headers({
      Location: result.location,
      "Cache-Control": "private, no-store",
    });
    for (const cookie of result.cookies) headers.append("Set-Cookie", cookie);
    return new Response(null, { status: 303, headers });
  } catch (error) {
    console.error(JSON.stringify({
      event: "partner_google_callback",
      result: "failed",
      error: error instanceof Error ? error.name : "unknown_error",
    }));
    const headers = new Headers({
      Location: error instanceof PartnerGoogleAuthError && error.status < 500
        ? "/partner/prihlasenie?google=invalid"
        : "/partner/prihlasenie?google=unavailable",
      "Cache-Control": "private, no-store",
    });
    headers.append("Set-Cookie", clearPartnerGoogleFlowCookie());
    return new Response(null, { status: 303, headers });
  }
}
