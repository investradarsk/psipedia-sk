import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { reviewDirectoryProfileChangeRequest } from "@/lib/directory-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Neplatné ID návrhu." }, { status: 400 });
  const body = await request.json() as { status?: string };
  if (body.status !== "approved" && body.status !== "rejected") return Response.json({ error: "Neplatný stav návrhu." }, { status: 400 });
  const reviewed = await reviewDirectoryProfileChangeRequest(id, body.status, user.email);
  return reviewed ? Response.json({ request: reviewed }) : Response.json({ error: "Nový návrh sa nenašiel alebo už bol posúdený." }, { status: 404 });
}
