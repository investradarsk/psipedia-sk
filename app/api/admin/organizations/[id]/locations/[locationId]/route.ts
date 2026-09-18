import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { OrganizationLocationAdminValidationError } from "@/lib/organization-location-admin";
import {
  deleteOrganizationLocationFromAdmin,
  isOrganizationLocationMutationConflict,
  updateOrganizationLocationFromAdmin,
} from "@/lib/organization-location-admin-write";

type RouteContext = { params: Promise<{ id: string; locationId: string }> };
type UpdateRequest = { payload?: unknown };

function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function parseIds(params: RouteContext["params"]) {
  const values = await params;
  return { organizationId: parseId(values.id), locationId: parseId(values.locationId) };
}

function expectsJson(request: Request) {
  return request.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof OrganizationLocationAdminValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (isOrganizationLocationMutationConflict(error)) {
    return Response.json({ error: error instanceof Error ? error.message : "Konflikt lokality." }, { status: 409 });
  }
  console.error("Organization location mutation failed", error);
  return Response.json({ error: fallback }, { status: 500 });
}

export async function PUT(request: Request, { params }: RouteContext) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const { organizationId, locationId } = await parseIds(params);
  if (!organizationId || !locationId) return Response.json({ error: "Neplatné ID lokality." }, { status: 400 });
  if (!expectsJson(request)) return Response.json({ error: "Očakáva sa JSON požiadavka." }, { status: 415 });

  let body: UpdateRequest;
  try {
    body = await request.json() as UpdateRequest;
  } catch {
    return Response.json({ error: "Neplatné JSON dáta." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("payload" in body)) {
    return Response.json({ error: "Chýba payload lokality." }, { status: 400 });
  }

  try {
    const item = await updateOrganizationLocationFromAdmin(organizationId, locationId, body.payload);
    return item
      ? Response.json({ item })
      : Response.json({ error: "Lokalita sa nenašla v tejto organizácii." }, { status: 404 });
  } catch (error) {
    return errorResponse(error, "Lokalitu sa nepodarilo uložiť.");
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const { organizationId, locationId } = await parseIds(params);
  if (!organizationId || !locationId) return Response.json({ error: "Neplatné ID lokality." }, { status: 400 });

  try {
    const deleted = await deleteOrganizationLocationFromAdmin(organizationId, locationId);
    return deleted
      ? Response.json({ deleted: true, id: locationId })
      : Response.json({ error: "Lokalita sa nenašla v tejto organizácii." }, { status: 404 });
  } catch (error) {
    return errorResponse(error, "Lokalitu sa nepodarilo odstrániť.");
  }
}
