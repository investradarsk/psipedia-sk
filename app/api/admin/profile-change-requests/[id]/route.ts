import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * Historic proposals remain readable until their Admin page is retired in
 * step 4/10. No new moderation state transitions are allowed.
 */
export async function PUT() {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  return Response.json(
    { error: "Staré návrhy úprav sa už neschvaľujú. Zmeny vykonajte cez Partner účet." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
