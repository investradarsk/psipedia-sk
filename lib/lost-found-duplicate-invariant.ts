import { env } from "cloudflare:workers";
import { dogReportTypes, type DogReportType } from "@/lib/lost-found-dogs";

type RuntimeBindings = { DB?: D1Database };

type DuplicateTypeSnapshot = {
  outboundTargetType?: string | null;
  inboundDuplicateTypes?: string[];
};

export function assertLostFoundDuplicateTypeInvariant(
  requestedType: DogReportType,
  { outboundTargetType = null, inboundDuplicateTypes = [] }: DuplicateTypeSnapshot,
) {
  if (outboundTargetType && outboundTargetType !== requestedType) {
    throw new Error("Typ hlásenia nemožno zmeniť, pretože by porušil existujúcu outbound duplicate väzbu.");
  }
  if (inboundDuplicateTypes.some((type) => type !== requestedType)) {
    throw new Error("Typ hlásenia nemožno zmeniť, pretože by porušil existujúcu inbound duplicate väzbu.");
  }
}

export async function assertAdminDogReportTypeChangeKeepsDuplicateInvariant(
  reportId: number,
  requestedTypeValue: unknown,
) {
  if (typeof requestedTypeValue !== "string" || !dogReportTypes.includes(requestedTypeValue as DogReportType)) return;
  const requestedType = requestedTypeValue as DogReportType;
  const database = (env as unknown as RuntimeBindings).DB;
  if (!database || typeof database.prepare !== "function") {
    throw new Error("Databáza stratených a nájdených psov nie je pripojená.");
  }

  const outbound = await database.prepare(`
    SELECT target.type AS type
    FROM lost_found_dog_reports child
    JOIN lost_found_dog_reports target ON target.id = child.duplicate_of_id
    WHERE child.id = ? AND child.duplicate_of_id IS NOT NULL
    LIMIT 1
  `).bind(reportId).first<{ type: string }>();

  const inbound = await database.prepare(`
    SELECT type
    FROM lost_found_dog_reports
    WHERE duplicate_of_id = ?
  `).bind(reportId).all<{ type: string }>();

  assertLostFoundDuplicateTypeInvariant(requestedType, {
    outboundTargetType: outbound?.type ?? null,
    inboundDuplicateTypes: (inbound.results ?? []).map((row) => row.type),
  });
}
