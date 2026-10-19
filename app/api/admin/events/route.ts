import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { createManagedEvent, isEventSlugConflict, listManagedEventPage, type ManagedEventInput } from "@/lib/event-store";
import { parseAdminEventListQuery } from "@/lib/admin-event-pagination";
import { listReviewedAdminEntityIds } from "@/lib/admin-entity-review-store";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Nastala neočakávaná chyba.";
  const conflict = isEventSlugConflict(error);
  return Response.json({ error: conflict ? "Túto adresu už používa iné podujatie." : message }, { status: conflict ? 409 : 400 });
}

export async function GET(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const query = parseAdminEventListQuery(new URL(request.url).searchParams);
    const result = await listManagedEventPage(query);
    const reviewedIds = await listReviewedAdminEntityIds("EVENT", result.events.map((event) => event.id));
    return Response.json({ ...result, reviewedIds }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin events pagination failed", error);
    return Response.json({ error: "Podujatia sa nepodarilo načítať." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const event = await createManagedEvent(await request.json() as ManagedEventInput, user.email);
    return Response.json({ event }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
