import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { createManagedEvent, isEventSlugConflict, listManagedEventSummaries, type ManagedEventInput } from "@/lib/event-store";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Nastala neočakávaná chyba.";
  const conflict = isEventSlugConflict(error);
  return Response.json({ error: conflict ? "Túto adresu už používa iné podujatie." : message }, { status: conflict ? 409 : 400 });
}

export async function GET() {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try { return Response.json({ events: await listManagedEventSummaries() }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Podujatia sa nepodarilo načítať." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const event = await createManagedEvent(await request.json() as ManagedEventInput, user.email);
    return Response.json({ event }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
