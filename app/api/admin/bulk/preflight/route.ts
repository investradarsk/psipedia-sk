import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { adminAuditActorRef } from "@/lib/audit-identity";
import { BulkPreflightError } from "@/lib/admin-bulk/core";
import { runBulkPreflight } from "@/lib/admin-bulk/preflight";
import { getBulkSelectionDatabase } from "@/lib/admin-bulk/snapshot-store";

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return noStoreJson({ error: "Očakáva sa JSON požiadavka." }, { status: 415 });
  }

  try {
    const payload = await request.json();
    const result = await runBulkPreflight(
      getBulkSelectionDatabase(),
      await adminAuditActorRef(user.email),
      payload,
    );
    return noStoreJson(result);
  } catch (error) {
    if (error instanceof BulkPreflightError) {
      return noStoreJson(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("Bulk preflight failed", error);
    return noStoreJson(
      { error: "Preflight sa nepodarilo pripraviť." },
      { status: 503 },
    );
  }
}
