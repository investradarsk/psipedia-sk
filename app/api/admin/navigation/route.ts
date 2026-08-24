import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { getNavigationItems, saveNavigationItems } from "@/lib/navigation-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  return Response.json({ items: await getNavigationItems() });
}

export async function PUT(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const body = await request.json() as { items?: unknown };
    return Response.json({ items: await saveNavigationItems(body.items, user.email) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Navigáciu sa nepodarilo uložiť." }, { status: 400 });
  }
}
