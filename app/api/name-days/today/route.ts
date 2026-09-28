import { getPublishedDogNameDaysForDate } from "@/lib/dog-name-day-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const names = await getPublishedDogNameDaysForDate();
  return Response.json({ names }, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
