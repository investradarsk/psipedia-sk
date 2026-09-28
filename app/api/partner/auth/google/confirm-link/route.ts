import { requirePartnerAccount } from "@/lib/partner-auth";
import { PartnerGoogleAuthError, confirmPendingGoogleLink } from "@/lib/partner-google-auth";
import { assertPartnerJsonMutation } from "@/lib/partner-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertPartnerJsonMutation(request);
    const cookieHeader = request.headers.get("cookie");
    const identity = await requirePartnerAccount({ cookieHeader, allowIncompleteOnboarding: true });
    const result = await confirmPendingGoogleLink({
      accountId: identity.accountId,
      cookieHeader,
    });
    return Response.json(
      { success: true, location: result.location },
      { status: 200, headers: { "Cache-Control": "private, no-store", "Set-Cookie": result.clearCookie } },
    );
  } catch (error) {
    const status = error instanceof PartnerGoogleAuthError
      ? error.status
      : error instanceof Error && "status" in error && typeof (error as {status?:unknown}).status === "number"
        ? (error as {status:number}).status
        : 503;
    if (status >= 500) {
      console.error(JSON.stringify({ event: "partner_google_link", result: "failed", error: error instanceof Error ? error.name : "unknown_error" }));
    }
    return Response.json(
      { error: status >= 500 ? "Google účet momentálne nie je možné prepojiť." : error instanceof Error ? error.message : "Google prepojenie nie je platné." },
      { status: status >= 500 ? 503 : status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
