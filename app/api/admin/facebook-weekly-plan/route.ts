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
import { FacebookTemplateConflict, readFacebookWeeklyTemplate, saveFacebookWeeklyTemplate,
  listFacebookTemplateMarks, setFacebookTemplateMark } from "@/lib/facebook-weekly-template-store";
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
    const [marks, template] = await Promise.all([
      listFacebookPlanMarks(weekStart),
      readFacebookWeeklyTemplate(),
    ]);
    const slotMarks = template.available && template.custom
      ? await listFacebookTemplateMarks(weekStart) : [];
    return Response.json({ weekStart, marks, slotMarks, template },
      { headers: NO_STORE });
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
  const isCustom = typeof values.slotId === "string";
  if (!isFacebookPlanDate(values.date) ||
    (isCustom ? !/^[a-z0-9][a-z0-9-]{0,63}$/.test(values.slotId as string) :
      !isFacebookPlanKey(values.slotKey)) ||
    typeof values.planned !== "boolean") {
    return Response.json({
      error: "Vyber platný termín z aktuálneho alebo nasledujúceho týždňa.",
    }, { status: 400, headers: NO_STORE });
  }

  try {
    if (isCustom) {
      await setFacebookTemplateMark(values.date as string,values.slotId as string,
        values.planned as boolean,auth.user.email);
    } else {
      await setFacebookPlanMark(values.date as string, values.slotKey as
        Parameters<typeof setFacebookPlanMark>[1],values.planned as boolean,auth.user.email);
    }
    return Response.json({
      date: values.date,
      ...(isCustom ? {slotId: values.slotId} : {slotKey: values.slotKey}),
      planned: values.planned,
    }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Changes only the editorial template, never scheduled posts or approval. */
export async function PUT(request: Request): Promise<Response> {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({error:"Neplatné údaje plánovača."},{status:400,headers:NO_STORE});
  }
  const values=body as Record<string,unknown>;
  if (Object.keys(values).some(key=>!["slots","expectedVersion"].includes(key))) {
    return Response.json({error:"Neplatné polia plánovača."},{status:400,headers:NO_STORE});
  }
  try {
    const template=await readFacebookWeeklyTemplate();
    if(!template.available) {
      return Response.json({error:"Uloženie šablóny čaká na samostatnú migráciu D1 0166."},
        {status:503,headers:NO_STORE});
    }
    const saved=await saveFacebookWeeklyTemplate(values.slots,values.expectedVersion,auth.user.email);
    return Response.json({template:saved},{headers:NO_STORE});
  } catch(error) {
    if(error instanceof FacebookTemplateConflict) {
      return Response.json({error:error.message},{status:409,headers:NO_STORE});
    }
    if(error instanceof Error && /Neplatný|Chýba|Každý|Plán|V jednom|Čas musí|Téma môže|Nepodporované/.test(error.message)) {
      return Response.json({error:error.message},{status:400,headers:NO_STORE});
    }
    return errorResponse(error);
  }
}
