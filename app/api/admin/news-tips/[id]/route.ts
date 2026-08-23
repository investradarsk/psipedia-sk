import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { deleteNewsTip, updateNewsTip, type NewsTipUpdateInput } from "@/lib/news-tip-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

async function numericId(params: Props["params"]) {
  const value = Number.parseInt((await params).id, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export async function PUT(request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID tipu." }, { status: 400 });
  try {
    const tip = await updateNewsTip(id, await request.json() as NewsTipUpdateInput);
    return tip ? Response.json({ tip }) : Response.json({ error: "Tip sa nenašiel." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Tip sa nepodarilo upraviť." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID tipu." }, { status: 400 });
  const tip = await deleteNewsTip(id);
  return tip ? Response.json({ deleted: true, id }) : Response.json({ error: "Tip sa nenašiel." }, { status: 404 });
}
