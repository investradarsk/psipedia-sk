import { articleBulkAdapter } from "./article-adapter";
import {
  BulkPreflightError,
  parseBulkExecutionRequest,
  revalidateMaterializedSelection,
  type BulkMaterializedItem,
  type BulkSkipReason,
} from "./core";
import {
  getBulkSelectionSnapshot,
  type BulkDatabase,
  type BulkStatement,
} from "./snapshot-store";

type RunResult = {
  meta?: { changes?: number };
  changes?: number;
};

export type BulkExecutionResult = {
  snapshotId: string;
  action: "publish" | "move-to-draft";
  requested: number;
  updated: Array<{ id: number }>;
  skipped: Array<{ id: number; reason: BulkSkipReason }>;
  failed: Array<{ id: number; reason: string }>;
  counts: {
    requested: number;
    updated: number;
    skipped: number;
    failed: number;
  };
};

function changedRows(result: unknown) {
  const value = result as RunResult | null;
  return Number(value?.meta?.changes ?? value?.changes ?? 0);
}

function sameIdSet(requested: readonly number[], captured: readonly BulkMaterializedItem[]) {
  if (requested.length !== captured.length) return false;
  const capturedIds = new Set(captured.map((item) => item.recordId));
  return requested.every((id) => capturedIds.has(String(id)));
}

function mutationStatement(
  database: BulkDatabase,
  action: "publish" | "move-to-draft",
  item: BulkMaterializedItem,
  editorEmail: string,
  now: string,
): BulkStatement {
  if (action === "publish") {
    return database.prepare(`UPDATE managed_articles
      SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ?, updated_by = ?
      WHERE id = ? AND status = ? AND updated_at = ?`)
      .bind(now, now, editorEmail, Number(item.recordId), item.capturedStatus, item.capturedUpdatedAt);
  }
  return database.prepare(`UPDATE managed_articles
    SET status = 'draft', updated_at = ?, updated_by = ?
    WHERE id = ? AND status = ? AND updated_at = ?`)
    .bind(now, editorEmail, Number(item.recordId), item.capturedStatus, item.capturedUpdatedAt);
}

export async function runArticleBulkExecution(
  database: BulkDatabase,
  actorRef: string,
  editorEmail: string,
  payload: unknown,
  now = new Date(),
): Promise<BulkExecutionResult> {
  const request = parseBulkExecutionRequest(payload);
  const stored = await getBulkSelectionSnapshot(database, request.snapshotId);
  if (!stored || stored.snapshot.actorRef !== actorRef) {
    throw new BulkPreflightError("Snapshot neexistuje alebo k nemu nemáš prístup.", 404, "snapshot-not-found");
  }
  if (Date.parse(stored.snapshot.expiresAt) <= now.getTime()) {
    throw new BulkPreflightError("Snapshot už expiroval.", 410, "snapshot-expired");
  }
  if (
    stored.snapshot.module !== "articles"
    || stored.snapshot.selectionMode !== "explicit"
    || stored.snapshot.action !== request.action
  ) {
    throw new BulkPreflightError("Snapshot nezodpovedá požadovanej article akcii.", 409, "snapshot-mismatch");
  }
  if (stored.snapshot.filterFingerprint !== request.membershipFingerprint) {
    throw new BulkPreflightError("Membership fingerprint sa od preflightu zmenil.", 409, "membership-mismatch");
  }
  if (!sameIdSet(request.selection.ids, stored.items)) {
    throw new BulkPreflightError("Execution výber nezodpovedá preflight snapshotu.", 409, "selection-mismatch");
  }

  const liveRecords = await articleBulkAdapter.resolveSnapshot(
    database,
    stored.items.map((item) => item.recordId),
  );
  const revalidated = revalidateMaterializedSelection(
    stored.items,
    liveRecords,
    (record) => articleBulkAdapter.evaluate(request.action, record),
  );

  const skipped: BulkExecutionResult["skipped"] = revalidated
    .filter((item) => !item.eligible)
    .map((item) => ({
      id: Number(item.recordId),
      reason: item.skipReason ?? "invalid-lifecycle",
    }));
  const updated: BulkExecutionResult["updated"] = [];
  const failed: BulkExecutionResult["failed"] = [];
  const timestamp = now.toISOString();

  for (const item of revalidated.filter((candidate) => candidate.eligible)) {
    const id = Number(item.recordId);
    try {
      const result = await mutationStatement(database, request.action, item, editorEmail, timestamp).run();
      if (changedRows(result) === 1) {
        updated.push({ id });
      } else {
        skipped.push({ id, reason: "record-changed-since-snapshot" });
      }
    } catch (error) {
      console.error("Article bulk mutation failed", { id, action: request.action, error });
      failed.push({ id, reason: "mutation-failed" });
    }
  }

  return {
    snapshotId: stored.snapshot.id,
    action: request.action,
    requested: request.selection.ids.length,
    updated,
    skipped,
    failed,
    counts: {
      requested: request.selection.ids.length,
      updated: updated.length,
      skipped: skipped.length,
      failed: failed.length,
    },
  };
}
