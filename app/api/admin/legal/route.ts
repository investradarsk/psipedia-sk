import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { getLegalSettings, saveLegalSettings, type LegalSettingsInput } from "@/lib/legal-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  return Response.json({ settings: await getLegalSettings() });
}

export async function PUT(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const settings = await saveLegalSettings(await request.json() as LegalSettingsInput, user.email);
    return Response.json({ settings });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Právne údaje sa nepodarilo uložiť." }, { status: 400 });
  }
}
