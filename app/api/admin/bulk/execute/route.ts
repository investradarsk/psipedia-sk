import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { adminAuditActorRef } from "@/lib/audit-identity";
import { BulkPreflightError } from "@/lib/admin-bulk/core";
import { runBulkExecution } from "@/lib/admin-bulk/execution";
import { getBulkSelectionDatabase } from "@/lib/admin-bulk/snapshot-store";
import { reconcileGeoAfterSourceMutation } from "@/lib/geo-store";

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return noStoreJson({ error: "Neplatný pôvod požiadavky." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return noStoreJson({ error: "Očakáva sa JSON požiadavka." }, { status: 415 });
  }

  try {
    const payload = await request.json();
    const database = getBulkSelectionDatabase();
    const result = await runBulkExecution(
      database,
      await adminAuditActorRef(user.email),
      user.email,
      payload,
    );
    if (payload?.module === "directory") {
      for (const item of result.updated) {
        await reconcileGeoAfterSourceMutation({
          targetType: "DIRECTORY_PROFILE",
          targetId: item.id,
          actorRef: user.email,
          actorType: "ADMIN",
        }, database as unknown as D1Database);
      }
    }
    return noStoreJson(result);
  } catch (error) {
    if (error instanceof BulkPreflightError) {
      return noStoreJson({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Admin bulk execution failed", error);
    return noStoreJson({ error: "Hromadnú zmenu sa nepodarilo vykonať." }, { status: 503 });
  }
}
