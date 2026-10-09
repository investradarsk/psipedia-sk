import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { listEditorialCalendarItems, parseEditorialCalendarMonth } from "@/lib/editorial-calendar";

export const dynamic = "force-dynamic";

/** Reuse the same canonical read model as the editorial calendar, never a second copy of article status logic. */
export async function GET(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  const rawMonth = new URL(request.url).searchParams.get("mesiac");
  if (!rawMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) || Number(rawMonth.slice(0, 4)) < 2000 ||
      Number(rawMonth.slice(0, 4)) > 2100) {
    return Response.json({ error: "Neplatný mesiac kalendára." }, { status: 400 });
  }

  try {
    const { year, month } = parseEditorialCalendarMonth(rawMonth);
    const items = await listEditorialCalendarItems(year, month);
    return Response.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Admin article calendar preview failed", error);
    return Response.json({ error: "Kalendár sa nepodarilo načítať." }, { status: 500 });
  }
}
