import {
  getAdminApiUser,
  requireAdminMutation,
  unauthorizedAdminResponse,
} from "@/lib/admin-auth";
import {
  facebookPlanWeekStart,
  isFacebookPlanDate,
  isFacebookPlanKey,
} from "@/lib/facebook-weekly-plan";
import {
  listFacebookPlanMarks,
  setFacebookPlanMark,
} from "@/lib/facebook-weekly-plan-store";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

function errorResponse(error: unknown): Response {
  const needsMigration = error instanceof Error &&
    /no such table:\s*facebook_weekly_plan_marks/i.test(error.message);
  return Response.json({
    error: needsMigration
      ? "Týždenný kalendár čaká na databázovú migráciu 0157."
      : "Kalendár sa nepodarilo načítať alebo uložiť. Skús to znova.",
  }, { status: 503, headers: NO_STORE });
}

export async function GET(): Promise<Response> {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  const weekStart = facebookPlanWeekStart();
  try {
    const marks = await listFacebookPlanMarks(weekStart);
    return Response.json({ weekStart, marks }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();

  const body: unknown = await request.json().catch(() => null);
  if (!body || Array.isArray(body) || typeof body !== "object") {
    return Response.json({ error: "Neplatné údaje kalendára." },
      { status: 400, headers: NO_STORE });
  }
  const values = body as Record<string, unknown>;
  if (!isFacebookPlanDate(values.date) || !isFacebookPlanKey(values.slotKey) ||
    typeof values.planned !== "boolean") {
    return Response.json({
      error: "Vyber platný termín z aktuálneho alebo nasledujúceho týždňa.",
    }, { status: 400, headers: NO_STORE });
  }

  try {
    await setFacebookPlanMark(values.date, values.slotKey, values.planned, auth.user.email);
    return Response.json({
      date: values.date,
      slotKey: values.slotKey,
      planned: values.planned,
    }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
