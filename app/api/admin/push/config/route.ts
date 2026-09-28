import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { getAdminPushConfig } from "@/lib/admin-push";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  return Response.json(getAdminPushConfig(), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
