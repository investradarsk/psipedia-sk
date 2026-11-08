import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { loadOrganizationGoogleMapsProfile } from "@/lib/organization-google-maps-workflow";
import { GET as sharedGET, POST as sharedPOST } from "@/app/api/admin/geo/[targetType]/[id]/route";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

/** Compatibility alias only. One canonical GEO API handles all 3 domains. */
async function sharedParams(params: Props["params"]) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const state = await loadOrganizationGoogleMapsProfile(id);
  if (!state?.canonicalLocation) return null;
  return { params: Promise.resolve({
    targetType: "ORGANIZATION_LOCATION",
    id: String(state.canonicalLocation.id),
  }) };
}

export async function GET(request: Request, { params }: Props) {
  if (!(await getAdminApiUser())) return unauthorizedAdminResponse();
  const target = await sharedParams(params);
  if (!target) return Response.json({ error: "Najprv ulož hlavnú adresu organizácie." }, { status: 404 });
  return sharedGET(request, target);
}
export async function POST(request: Request, { params }: Props) {
  if (!(await getAdminApiUser())) return unauthorizedAdminResponse();
  const target = await sharedParams(params);
  if (!target) return Response.json({ error: "Najprv ulož hlavnú adresu organizácie." }, { status: 404 });
  return sharedPOST(request, target);
}
