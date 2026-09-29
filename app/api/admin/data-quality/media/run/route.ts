import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { runMediaSourceMonitorSweep } from "@/lib/media-source-monitor";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const result = await runMediaSourceMonitorSweep({
      database: env.DB,
      bindings: env,
      limit: 100,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Kontrola obrázkov sa nepodarila." },
      { status: 500 },
    );
  }
}
