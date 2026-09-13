import {
  BulkPreflightError,
  materializeBulkSelection,
  parseBulkPreflightRequest,
  revalidateMaterializedSelection,
  summarizeBulkSelection,
  type BulkPreflightRequest,
} from "./core";
import { getBulkModuleAdapter } from "./registry";
import {
  createBulkSelectionSnapshot,
  getBulkSelectionSnapshot,
  type BulkDatabase,
} from "./snapshot-store";

function publicSnapshot(snapshot: {
  id: string;
  module: string;
  action: string;
  selectionMode: string;
  filterFingerprint: string;
  createdAt: string;
  expiresAt: string;
}) {
  return {
    id: snapshot.id,
    module: snapshot.module,
    action: snapshot.action,
    mode: snapshot.selectionMode,
    filterFingerprint: snapshot.filterFingerprint,
    createdAt: snapshot.createdAt,
    expiresAt: snapshot.expiresAt,
  };
}

export async function runBulkPreflight(
  database: BulkDatabase,
  actorRef: string,
  payload: unknown,
  now?: Date,
) {
  const request = parseBulkPreflightRequest(payload);
  const adapter = getBulkModuleAdapter(request.module);
  if (!adapter || !adapter.allowedActions.includes(request.action)) {
    throw new BulkPreflightError("Táto akcia nie je pre modul povolená.", 400, "invalid-action");
  }

  const normalizedFilter = adapter.normalizeFilter(request.selection.filter);
  const filterFingerprint = adapter.filterFingerprint(normalizedFilter);

  let requestedIds: string[];
  let records;
  if (request.selection.mode === "explicit") {
    requestedIds = request.selection.ids.map(String);
    records = await adapter.resolveExplicit(database, request.selection.ids);
  } else {
    records = await adapter.resolveAllMatching(database, normalizedFilter);
    requestedIds = records.map((record) => record.id);
  }

  const items = materializeBulkSelection(
    requestedIds,
    records,
    (record) => adapter.evaluate(request.action, record),
  );
  const summary = summarizeBulkSelection(items);
  const snapshot = await createBulkSelectionSnapshot(database, {
    module: request.module,
    action: request.action,
    selectionMode: request.selection.mode,
    membershipFilter: normalizedFilter,
    filterFingerprint,
    actorRef,
    items,
    now,
  });

  return {
    snapshot: publicSnapshot(snapshot),
    ...summary,
  };
}

export async function revalidateBulkPreflight(
  database: BulkDatabase,
  actorRef: string,
  snapshotId: string,
  now = new Date(),
) {
  if (!snapshotId || snapshotId.length > 100) {
    throw new BulkPreflightError("Neplatný snapshot.", 400, "invalid-snapshot");
  }
  const stored = await getBulkSelectionSnapshot(database, snapshotId);
  if (!stored || stored.snapshot.actorRef !== actorRef) {
    throw new BulkPreflightError("Snapshot neexistuje alebo k nemu nemáš prístup.", 404, "snapshot-not-found");
  }
  if (Date.parse(stored.snapshot.expiresAt) <= now.getTime()) {
    throw new BulkPreflightError("Snapshot už expiroval.", 410, "snapshot-expired");
  }

  const adapter = getBulkModuleAdapter(stored.snapshot.module);
  if (!adapter || !adapter.allowedActions.includes(stored.snapshot.action)) {
    throw new BulkPreflightError("Snapshot používa nepovolenú akciu.", 400, "invalid-action");
  }
  const currentRecords = await adapter.resolveSnapshot(
    database,
    stored.items.map((item) => item.recordId),
  );
  const items = revalidateMaterializedSelection(
    stored.items,
    currentRecords,
    (record) => adapter.evaluate(stored.snapshot.action, record),
  );

  return {
    snapshot: publicSnapshot(stored.snapshot),
    ...summarizeBulkSelection(items),
  };
}

export type { BulkPreflightRequest };
