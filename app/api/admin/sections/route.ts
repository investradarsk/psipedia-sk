import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { listManagedPortalSections, saveManagedPortalSections } from "@/lib/section-store";
export const dynamic = "force-dynamic";
export async function GET() { const user = await getAdminApiUser(); return user ? Response.json({ sections: await listManagedPortalSections() }) : unauthorizedAdminResponse(); }
export async function PUT(request: Request) {
  const user = await getAdminApiUser(); if (!user) return unauthorizedAdminResponse();
  try { const body = await request.json() as { sections?: unknown }; return Response.json({ sections: await saveManagedPortalSections(body.sections, user.email) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Sekcie sa nepodarilo uložiť." }, { status: 400 }); }
}
