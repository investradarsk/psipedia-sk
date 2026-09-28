import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { adminAuditActorRef } from "@/lib/audit-identity";
import { BulkPreflightError } from "@/lib/admin-bulk/core";
import { revalidateBulkPreflight } from "@/lib/admin-bulk/preflight";
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
    const payload = await request.json() as { snapshotId?: unknown };
    const snapshotId = typeof payload?.snapshotId === "string" ? payload.snapshotId : "";
    const result = await revalidateBulkPreflight(
      getBulkSelectionDatabase(),
      await adminAuditActorRef(user.email),
      snapshotId,
    );
    return noStoreJson(result);
  } catch (error) {
    if (error instanceof BulkPreflightError) {
      return noStoreJson(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("Bulk preflight revalidation failed", error);
    return noStoreJson(
      { error: "Snapshot sa nepodarilo znovu overiť." },
      { status: 503 },
    );
  }
}
