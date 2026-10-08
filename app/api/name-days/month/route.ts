import { getPublishedDogNameDaysForMonth } from "@/lib/dog-name-day-store";

export const dynamic = "force-dynamic";

/** Public canonical read, restricted to the published month and no-store to bypass HTML caching. */
export async function GET(request: Request) {
  const rawMonth = new URL(request.url).searchParams.get("month") ?? "";
  const month = /^0[1-9]$|^1[0-2]$/.test(rawMonth) ? Number(rawMonth) : 0;
  if (!month) {
    return Response.json({ error: "Neplatný mesiac." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const records = await getPublishedDogNameDaysForMonth(month);
  return Response.json({ records }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
