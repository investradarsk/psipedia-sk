import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { INTERNAL_TRAFFIC_COOKIE_NAME, hasInternalTrafficCookie } from "@/lib/internal-traffic";

export const dynamic = "force-dynamic";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function analyticsCookie(enabled: boolean, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return enabled
    ? `${INTERNAL_TRAFFIC_COOKIE_NAME}=1; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure}`
    : `${INTERNAL_TRAFFIC_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

export async function GET(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  return Response.json(
    { excluded: hasInternalTrafficCookie(request.headers.get("cookie")) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Neplatný formát požiadavky." }, { status: 415 });
  }

  try {
    const body = await request.json() as { excluded?: unknown };
    if (typeof body.excluded !== "boolean") {
      return Response.json({ error: "Chýba stav zariadenia." }, { status: 400 });
    }

    return Response.json(
      { excluded: body.excluded },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Set-Cookie": analyticsCookie(body.excluded, request),
        },
      },
    );
  } catch {
    return Response.json({ error: "Nastavenie zariadenia sa nepodarilo uložiť." }, { status: 400 });
  }
}
