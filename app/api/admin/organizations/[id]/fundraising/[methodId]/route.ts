import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { OrganizationFundraisingAdminValidationError } from "@/lib/organization-fundraising-admin";
import {
  archiveOrganizationFundraisingMethodFromAdmin,
  isOrganizationFundraisingAdminConflict,
  updateOrganizationFundraisingMethodFromAdmin,
} from "@/lib/organization-fundraising-admin-write";

type RouteContext = { params: Promise<{ id: string; methodId: string }> };
type UpdateRequest = { payload?: unknown; expectedVersion?: unknown };
type ArchiveRequest = { expectedVersion?: unknown };

function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function parseIds(params: RouteContext["params"]) {
  const values = await params;
  return { organizationId: parseId(values.id), methodId: parseId(values.methodId) };
}

function expectedVersion(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof OrganizationFundraisingAdminValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (isOrganizationFundraisingAdminConflict(error)) {
    return Response.json({ error: error instanceof Error ? error.message : "Fundraising konflikt." }, { status: 409 });
  }
  console.error("Organization fundraising mutation failed", error);
  return Response.json({ error: fallback }, { status: 500 });
}

export async function PUT(request: Request, { params }: RouteContext) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const { organizationId, methodId } = await parseIds(params);
  if (!organizationId || !methodId) return Response.json({ error: "Neplatné ID fundraising metódy." }, { status: 400 });

  let body: UpdateRequest;
  try {
    body = await request.json() as UpdateRequest;
  } catch {
    return Response.json({ error: "Neplatné JSON dáta." }, { status: 400 });
  }
  const version = expectedVersion(body?.expectedVersion);
  if (!body || typeof body !== "object" || !("payload" in body) || !version) {
    return Response.json({ error: "Chýba fundraising payload alebo platná verzia záznamu." }, { status: 400 });
  }

  try {
    const item = await updateOrganizationFundraisingMethodFromAdmin(
      organizationId,
      methodId,
      body.payload,
      user.email,
      version,
    );
    return item
      ? Response.json({ item })
      : Response.json({ error: "Fundraising metóda sa nenašla v tejto organizácii." }, { status: 404 });
  } catch (error) {
    return errorResponse(error, "Fundraising metódu sa nepodarilo uložiť.");
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const { organizationId, methodId } = await parseIds(params);
  if (!organizationId || !methodId) return Response.json({ error: "Neplatné ID fundraising metódy." }, { status: 400 });

  let body: ArchiveRequest;
  try {
    body = await request.json() as ArchiveRequest;
  } catch {
    return Response.json({ error: "Neplatné JSON dáta." }, { status: 400 });
  }
  const version = expectedVersion(body?.expectedVersion);
  if (!version) return Response.json({ error: "Chýba platná verzia fundraising metódy." }, { status: 400 });

  try {
    const item = await archiveOrganizationFundraisingMethodFromAdmin(
      organizationId,
      methodId,
      user.email,
      version,
    );
    return item
      ? Response.json({ item })
      : Response.json({ error: "Fundraising metóda sa nenašla v tejto organizácii." }, { status: 404 });
  } catch (error) {
    return errorResponse(error, "Fundraising metódu sa nepodarilo archivovať.");
  }
}
