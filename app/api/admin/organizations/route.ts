import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { OrganizationAdminValidationError } from "@/lib/help-organization-admin-input";
import {
  createOrganizationFromAdmin,
  isOrganizationAdminWriteConflict,
} from "@/lib/help-organization-admin-write";

export const dynamic = "force-dynamic";

function expectsJson(request: Request) {
  return request.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  if (!expectsJson(request)) return Response.json({ error: "Očakáva sa JSON požiadavka." }, { status: 415 });
  try {
    const item = await createOrganizationFromAdmin(await request.json(), user.email);
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof OrganizationAdminValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (isOrganizationAdminWriteConflict(error)) {
      return Response.json({ error: error instanceof Error ? error.message : "Konflikt organizácie." }, { status: 409 });
    }
    console.error("Organization create failed", error);
    return Response.json({ error: "Organizáciu sa nepodarilo vytvoriť." }, { status: 500 });
  }
}
