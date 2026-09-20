import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  changeOrganizationPublicationFromAdmin,
  OrganizationConcurrentEditError,
  OrganizationPublicationBlockedError,
  OrganizationPublicationTransitionError,
  type OrganizationPublicationAction,
} from "@/lib/help-organization-admin-write";

export const dynamic = "force-dynamic";

const MAX_BULK_ORGANIZATIONS = 500;
const actions = new Set<OrganizationPublicationAction>(["publish", "unpublish", "archive", "restore"]);

type BulkOrganizationItem = {
  id: number;
  updatedAt: string;
};

type BulkRequest = {
  action?: unknown;
  items?: unknown;
};

function parseRequest(value: unknown): { action: OrganizationPublicationAction; items: BulkOrganizationItem[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Neplatná hromadná požiadavka.");
  const input = value as BulkRequest;
  if (typeof input.action !== "string" || !actions.has(input.action as OrganizationPublicationAction)) {
    throw new Error("Neplatná lifecycle akcia organizácie.");
  }
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > MAX_BULK_ORGANIZATIONS) {
    throw new Error(`Vyber 1 až ${MAX_BULK_ORGANIZATIONS} organizácií.`);
  }

  const seen = new Set<number>();
  const items = input.items.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Výber organizácií je neplatný.");
    const item = raw as { id?: unknown; updatedAt?: unknown };
    if (!Number.isSafeInteger(item.id) || Number(item.id) <= 0 || seen.has(Number(item.id))) {
      throw new Error("Výber organizácií obsahuje neplatné alebo duplicitné ID.");
    }
    if (typeof item.updatedAt !== "string" || !item.updatedAt.trim()) {
      throw new Error("Výber organizácií neobsahuje platnú verziu záznamu.");
    }
    const id = Number(item.id);
    seen.add(id);
    return { id, updatedAt: item.updatedAt };
  });

  return { action: input.action as OrganizationPublicationAction, items };
}

function failureReason(error: unknown) {
  if (error instanceof OrganizationConcurrentEditError) return "record-changed";
  if (error instanceof OrganizationPublicationBlockedError) return "publication-blocked";
  if (error instanceof OrganizationPublicationTransitionError) return "invalid-lifecycle";
  return "mutation-failed";
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  if (
    request.headers.get("origin") !== new URL(request.url).origin
    || !request.headers.get("content-type")?.toLowerCase().includes("application/json")
  ) {
    return Response.json({ error: "Neplatný pôvod alebo formát požiadavky." }, { status: 403 });
  }

  let parsed: ReturnType<typeof parseRequest>;
  try {
    parsed = parseRequest(await request.json());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Neplatná hromadná požiadavka." },
      { status: 400 },
    );
  }

  const updated: Array<{ id: number }> = [];
  const failed: Array<{ id: number; reason: string }> = [];

  for (const item of parsed.items) {
    try {
      const result = await changeOrganizationPublicationFromAdmin(
        item.id,
        parsed.action,
        user.email,
        item.updatedAt,
      );
      if (result) updated.push({ id: item.id });
      else failed.push({ id: item.id, reason: "record-no-longer-exists" });
    } catch (error) {
      console.error("Organization bulk lifecycle mutation failed", {
        id: item.id,
        action: parsed.action,
        error,
      });
      failed.push({ id: item.id, reason: failureReason(error) });
    }
  }

  return Response.json({
    action: parsed.action,
    requested: parsed.items.length,
    updated,
    failed,
    counts: {
      requested: parsed.items.length,
      updated: updated.length,
      failed: failed.length,
    },
  });
}
