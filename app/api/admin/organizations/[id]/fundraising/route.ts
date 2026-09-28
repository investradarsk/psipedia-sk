import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { OrganizationFundraisingAdminValidationError } from "@/lib/organization-fundraising-admin";
import {
  createOrganizationFundraisingMethodFromAdmin,
  isOrganizationFundraisingAdminConflict,
} from "@/lib/organization-fundraising-admin-write";

type RouteContext = { params: Promise<{ id: string }> };
type CreateRequest = { payload?: unknown };

function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function errorResponse(error: unknown) {
  if (error instanceof OrganizationFundraisingAdminValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (isOrganizationFundraisingAdminConflict(error)) {
    return Response.json({ error: error instanceof Error ? error.message : "Fundraising konflikt." }, { status: 409 });
  }
  console.error("Organization fundraising create failed", error);
  return Response.json({ error: "Fundraising metódu sa nepodarilo vytvoriť." }, { status: 500 });
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  const organizationId = parseId((await params).id);
  if (!organizationId) return Response.json({ error: "Neplatné ID organizácie." }, { status: 400 });

  let body: CreateRequest;
  try {
    body = await request.json() as CreateRequest;
  } catch {
    return Response.json({ error: "Neplatné JSON dáta." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("payload" in body)) {
    return Response.json({ error: "Chýba fundraising payload." }, { status: 400 });
  }

  try {
    const item = await createOrganizationFundraisingMethodFromAdmin(organizationId, body.payload, user.email);
    return item
      ? Response.json({ item }, { status: 201 })
      : Response.json({ error: "Organizácia neexistuje." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
