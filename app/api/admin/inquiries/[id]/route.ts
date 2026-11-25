import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { deleteDirectoryInquiry, updateDirectoryInquiryStatus } from "@/lib/directory-store";
import type { DirectoryInquiryStatus } from "@/lib/directory";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

async function numericId(params: Props["params"]) {
  const { id } = await params;
  const value = /^[0-9]+$/.test(id) ? Number(id) : NaN;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export async function PUT(request: Request, { params }: Props) {
  const user = await getAdminApiUser(); if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params); if (!id) return Response.json({ error: "Neplatné ID dopytu." }, { status: 400 });
  const body = await request.json().catch(() => null) as {
    status?: DirectoryInquiryStatus;
    expectedUpdatedAt?: unknown;
  } | null;
  if (!body?.status || !(["new", "read", "resolved"] as const).includes(body.status))
    return Response.json({ error: "Neplatný stav dopytu." }, { status: 400 });
  const { expectedUpdatedAt } = body;
  if (expectedUpdatedAt !== undefined && (typeof expectedUpdatedAt !== "string" ||
      expectedUpdatedAt.length > 64 || !Number.isFinite(Date.parse(expectedUpdatedAt))))
    return Response.json({ error: "Neplatný čas poslednej úpravy dopytu." }, { status: 400 });

  const result = await updateDirectoryInquiryStatus(id, body.status, expectedUpdatedAt);
  if (result.status === "updated") return Response.json({ inquiry: result.inquiry });
  if (result.status === "conflict")
    return Response.json({ error: "Dopyt sa medzitým zmenil. Obnov stránku a skontroluj jeho aktuálny stav." }, { status: 409 });
  return Response.json({ error: "Dopyt sa nenašiel." }, { status: 404 });
}

export async function DELETE(_request: Request, { params }: Props) {
  const user = await getAdminApiUser(); if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params); if (!id) return Response.json({ error: "Neplatné ID dopytu." }, { status: 400 });
  const inquiry = await deleteDirectoryInquiry(id);
  return inquiry ? Response.json({ deleted: true, id }) : Response.json({ error: "Dopyt sa nenašiel." }, { status: 404 });
}
