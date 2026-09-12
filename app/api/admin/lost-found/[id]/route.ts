import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { getAdminDogReport, updateAdminDogReport, type ManagedDogReportInput } from "@/lib/lost-found-dog-store";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, { params }: Context) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) return Response.json({ error: "Neplatné ID hlásenia." }, { status: 400 });
  try {
    const input = await request.json() as ManagedDogReportInput;
    const existing = await getAdminDogReport(numericId);
    if (!existing) return Response.json({ error: "Hlásenie neexistuje." }, { status: 404 });
    const report = await updateAdminDogReport(numericId, input.gallery === undefined ? { ...input, gallery: existing.gallery } : input, user.email);
    return Response.json({ report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hlásenie sa nepodarilo uložiť.";
    return Response.json({ error: message }, { status: message === "Hlásenie neexistuje." ? 404 : 400 });
  }
}
