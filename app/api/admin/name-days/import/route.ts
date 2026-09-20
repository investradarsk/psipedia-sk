import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { applyDogNameDayImportPlan, listDogNameDayRecords } from "@/lib/dog-name-day-store";
import { planDogNameDayImport } from "@/lib/dog-name-day-import";

export const dynamic = "force-dynamic";

type ImportRequest = { records?: unknown; apply?: boolean };

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const body = await request.json() as ImportRequest;
    const existing = await listDogNameDayRecords();
    const plan = planDogNameDayImport(existing, body.records);
    if (!body.apply) return Response.json({ plan, applied: false });
    if (plan.summary.ERROR > 0) {
      return Response.json({ error: "Import obsahuje chyby. Nič nebolo zmenené.", plan, applied: false }, { status: 400 });
    }
    const result = await applyDogNameDayImportPlan(plan, user.email);
    return Response.json({ plan, result, applied: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Import sa nepodaril." }, { status: 400 });
  }
}
