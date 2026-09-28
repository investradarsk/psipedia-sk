import { isPartnerPasswordAuthPublicError, loginPartnerWithPassword } from "@/lib/partner-password-auth";
import { assertPartnerJsonMutation } from "@/lib/partner-security";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (isPartnerPasswordAuthPublicError(error)) {
    const status = error.status >= 500 ? 503 : error.status;
    return Response.json(
      { error: status >= 500 ? "Partner prihlásenie momentálne nie je dostupné." : error.message },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  console.error(JSON.stringify({
    event: "partner_password_auth",
    result: "failed",
    error: error instanceof Error ? error.name : "unknown_error",
  }));
  return Response.json(
    { error: "Partner prihlásenie momentálne nie je dostupné." },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    assertPartnerJsonMutation(request);
    const body = await request.json() as Record<string, unknown>;
    const result = await loginPartnerWithPassword({
      request,
      email: body.email,
      password: body.password,
      turnstileToken: body.turnstileToken,
    });
    return Response.json(
      { success: true, onboardingComplete: result.onboardingComplete },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store", "Set-Cookie": result.cookie },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
