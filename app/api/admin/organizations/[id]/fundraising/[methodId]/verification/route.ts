import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  changeOrganizationFundraisingVerificationFromAdmin,
  isOrganizationFundraisingVerificationConflict,
  normalizeOrganizationFundraisingVerificationCommand,
  OrganizationFundraisingVerificationValidationError,
} from "@/lib/organization-fundraising-verification";

type RouteContext = { params: Promise<{ id: string; methodId: string }> };

function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PUT(request: Request, { params }: RouteContext) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  const values = await params;
  const organizationId = parseId(values.id);
  const methodId = parseId(values.methodId);
  if (!organizationId || !methodId) {
    return Response.json({ error: "Neplatné ID fundraising metódy." }, { status: 400 });
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return Response.json({ error: "Verification endpoint prijíma iba JSON." }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatné JSON dáta." }, { status: 400 });
  }

  try {
    const command = normalizeOrganizationFundraisingVerificationCommand(body);
    const item = await changeOrganizationFundraisingVerificationFromAdmin(
      organizationId,
      methodId,
      command,
      user.email,
    );
    return item
      ? Response.json({ item })
      : Response.json({ error: "Fundraising metóda sa nenašla v tejto organizácii." }, { status: 404 });
  } catch (error) {
    if (error instanceof OrganizationFundraisingVerificationValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (isOrganizationFundraisingVerificationConflict(error)) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Fundraising verification konflikt." },
        { status: 409 },
      );
    }
    console.error("Organization fundraising verification mutation failed");
    return Response.json({ error: "Fundraising verification sa nepodarilo uložiť." }, { status: 500 });
  }
}
