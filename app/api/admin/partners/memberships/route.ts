import { requirePartnerAdminMutation } from "@/lib/partner-admin-api";
import { createPartnerMembershipAdmin } from "@/lib/partner-admin-store";
import { isPartnerSingleManagerConstraintError, PartnerSingleManagerConflictError } from "@/lib/partner-single-manager";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requirePartnerAdminMutation(request);
  if (auth.response) return auth.response;
  try {
    const body = await request.json() as {
      accountId: string;
      entityType: "DIRECTORY_PROFILE" | "HELP_ORGANIZATION" | "MANAGED_EVENT";
      canonicalId: number;
      role?: "OWNER" | "MANAGER" | "EDITOR";
    };
    const membership = await createPartnerMembershipAdmin({ ...body, adminEmail: auth.user.email });
    return Response.json({ membership }, { status: 201 });
  } catch (error) {
    if (error instanceof PartnerSingleManagerConflictError || isPartnerSingleManagerConstraintError(error)) {
      return Response.json({ error: "Tento záznam už spravuje iný partner. Najprv mu odoberte prístup." }, { status: 409 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Prístup sa nepodarilo vytvoriť." }, { status: 400 });
  }
}
