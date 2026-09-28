import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  archiveDogNameDayRecord,
  getDogNameDayRecord,
  isDogNameDayConflict,
  updateDogNameDayRecord,
  type DogNameDayInput,
} from "@/lib/dog-name-day-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

async function numericId(params: Props["params"]) {
  const id = Number.parseInt((await params).id, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function errorResponse(error: unknown) {
  const conflict = isDogNameDayConflict(error);
  return Response.json({
    error: conflict ? "Toto meno už pre rovnaký deň existuje." : error instanceof Error ? error.message : "Záznam sa nepodarilo uložiť.",
  }, { status: conflict ? 409 : 400 });
}

export async function GET(_request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID záznamu." }, { status: 400 });
  const record = await getDogNameDayRecord(id);
  return record ? Response.json({ record }) : Response.json({ error: "Záznam sa nenašiel." }, { status: 404 });
}

export async function PUT(request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID záznamu." }, { status: 400 });
  try {
    const existing = await getDogNameDayRecord(id);
    if (!existing) return Response.json({ error: "Záznam sa nenašiel." }, { status: 404 });
    const record = await updateDogNameDayRecord(id, await request.json() as DogNameDayInput, user.email, existing);
    return record ? Response.json({ record }) : Response.json({ error: "Záznam sa nenašiel." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID záznamu." }, { status: 400 });
  try {
    const record = await archiveDogNameDayRecord(id, user.email);
    return record ? Response.json({ record, archived: true }) : Response.json({ error: "Záznam sa nenašiel." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Záznam sa nepodarilo archivovať." }, { status: 500 });
  }
}
