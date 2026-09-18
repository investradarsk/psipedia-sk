import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { OrganizationLocationAdminValidationError } from "@/lib/organization-location-admin";
import {
  createOrganizationLocationFromAdmin,
  isOrganizationLocationMutationConflict,
} from "@/lib/organization-location-admin-write";

type RouteContext = { params: Promise<{ id: string }> };
type CreateRequest = { payload?: unknown };

function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function expectsJson(request: Request) {
  return request.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;
}

function errorResponse(error: unknown) {
  if (error instanceof OrganizationLocationAdminValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (isOrganizationLocationMutationConflict(error)) {
    return Response.json({ error: error instanceof Error ? error.message : "Konflikt lokality." }, { status: 409 });
  }
  console.error("Organization location create failed", error);
  return Response.json({ error: "Lokalitu sa nepodarilo vytvoriť." }, { status: 500 });
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  const organizationId = parseId((await params).id);
  if (!organizationId) return Response.json({ error: "Neplatné ID organizácie." }, { status: 400 });
  if (!expectsJson(request)) return Response.json({ error: "Očakáva sa JSON požiadavka." }, { status: 415 });

  let body: CreateRequest;
  try {
    body = await request.json() as CreateRequest;
  } catch {
    return Response.json({ error: "Neplatné JSON dáta." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("payload" in body)) {
    return Response.json({ error: "Chýba payload lokality." }, { status: 400 });
  }

  try {
    const item = await createOrganizationLocationFromAdmin(organizationId, body.payload);
    return item
      ? Response.json({ item }, { status: 201 })
      : Response.json({ error: "Organizácia neexistuje." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
