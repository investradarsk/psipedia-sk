import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { deleteDirectoryInquiry, updateDirectoryInquiryStatus } from "@/lib/directory-store";
import type { DirectoryInquiryStatus } from "@/lib/directory";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

async function numericId(params: Props["params"]) {
  const value = Number.parseInt((await params).id, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export async function PUT(request: Request, { params }: Props) {
  const user = await getAdminApiUser(); if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params); if (!id) return Response.json({ error: "Neplatné ID dopytu." }, { status: 400 });
  const body = await request.json() as { status?: DirectoryInquiryStatus };
  if (!body.status || !(["new", "read", "resolved"] as const).includes(body.status)) return Response.json({ error: "Neplatný stav dopytu." }, { status: 400 });
  const inquiry = await updateDirectoryInquiryStatus(id, body.status);
  return inquiry ? Response.json({ inquiry }) : Response.json({ error: "Dopyt sa nenašiel." }, { status: 404 });
}

export async function DELETE(_request: Request, { params }: Props) {
  const user = await getAdminApiUser(); if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params); if (!id) return Response.json({ error: "Neplatné ID dopytu." }, { status: 400 });
  const inquiry = await deleteDirectoryInquiry(id);
  return inquiry ? Response.json({ deleted: true, id }) : Response.json({ error: "Dopyt sa nenašiel." }, { status: 404 });
}
