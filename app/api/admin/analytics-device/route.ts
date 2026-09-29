import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "psipedia_internal";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function hasAnalyticsExclusion(cookieHeader: string | null) {
  return (cookieHeader ?? "")
    .split(";")
    .some((cookie) => cookie.trim() === `${COOKIE_NAME}=1`);
}

function analyticsCookie(enabled: boolean, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return enabled
    ? `${COOKIE_NAME}=1; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure}`
    : `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

export async function GET(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  return Response.json(
    { excluded: hasAnalyticsExclusion(request.headers.get("cookie")) },
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
