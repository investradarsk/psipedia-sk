import { env } from "cloudflare:workers";
import type {
  BulkAction,
  BulkMaterializedItem,
  BulkModule,
  BulkSelectionMode,
} from "./core";

export type BulkStatement = {
  bind(...values: (string | number | null)[]): BulkStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};

export type BulkDatabase = {
  prepare(sql: string): BulkStatement;
  batch(statements: BulkStatement[]): Promise<unknown[]>;
};

export type BulkSelectionSnapshot = {
  id: string;
  module: BulkModule;
  action: BulkAction;
  selectionMode: BulkSelectionMode;
  membershipFilter: unknown;
  filterFingerprint: string;
  actorRef: string;
  matchedCount: number;
  createdAt: string;
  expiresAt: string;
};

type SnapshotRow = {
  id: string;
  module: BulkModule;
  action: BulkAction;
  selection_mode: BulkSelectionMode;
  membership_filter_json: string;
  filter_fingerprint: string;
  actor_ref: string;
  matched_count: number;
  created_at: string;
  expires_at: string;
};

type SnapshotItemRow = {
  record_id: string;
  exists_at_snapshot: number;
  captured_status: string | null;
  captured_updated_at: string | null;
  eligible: number;
  skip_reason: BulkMaterializedItem["skipReason"];
};

const SNAPSHOT_TTL_MS = 15 * 60 * 1000;

export function getBulkSelectionDatabase(): BulkDatabase {
  const database = (env as unknown as { DB?: BulkDatabase }).DB;
  if (!database) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return database;
}

export async function createBulkSelectionSnapshot(
  database: BulkDatabase,
  input: {
    module: BulkModule;
    action: BulkAction;
    selectionMode: BulkSelectionMode;
    membershipFilter: unknown;
    filterFingerprint: string;
    actorRef: string;
    items: readonly BulkMaterializedItem[];
    now?: Date;
  },
): Promise<BulkSelectionSnapshot> {
  const now = input.now ?? new Date();
  const snapshot: BulkSelectionSnapshot = {
    id: crypto.randomUUID(),
    module: input.module,
    action: input.action,
    selectionMode: input.selectionMode,
    membershipFilter: input.membershipFilter,
    filterFingerprint: input.filterFingerprint,
    actorRef: input.actorRef,
    matchedCount: input.items.length,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SNAPSHOT_TTL_MS).toISOString(),
  };

  const statements: BulkStatement[] = [
    database.prepare(`INSERT INTO admin_bulk_selection_snapshots (
      id, module, action, selection_mode, membership_filter_json, filter_fingerprint,
      actor_ref, matched_count, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      snapshot.id,
      snapshot.module,
      snapshot.action,
      snapshot.selectionMode,
      JSON.stringify(snapshot.membershipFilter),
      snapshot.filterFingerprint,
      snapshot.actorRef,
      snapshot.matchedCount,
      snapshot.createdAt,
      snapshot.expiresAt,
    ),
    ...input.items.map((item) =>
      database.prepare(`INSERT INTO admin_bulk_selection_items (
        snapshot_id, record_id, exists_at_snapshot, captured_status, captured_updated_at, eligible, skip_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
        snapshot.id,
        item.recordId,
        item.existsAtSnapshot ? 1 : 0,
        item.capturedStatus,
        item.capturedUpdatedAt,
        item.eligible ? 1 : 0,
        item.skipReason,
      ),
    ),
  ];

  await database.batch(statements);
  return snapshot;
}

export async function getBulkSelectionSnapshot(
  database: BulkDatabase,
  snapshotId: string,
): Promise<{ snapshot: BulkSelectionSnapshot; items: BulkMaterializedItem[] } | null> {
  const row = await database.prepare(`SELECT
    id, module, action, selection_mode, membership_filter_json, filter_fingerprint,
    actor_ref, matched_count, created_at, expires_at
    FROM admin_bulk_selection_snapshots WHERE id = ?`).bind(snapshotId).first<SnapshotRow>();
  if (!row) return null;

  const itemRows = await database.prepare(`SELECT
    record_id, exists_at_snapshot, captured_status, captured_updated_at, eligible, skip_reason
    FROM admin_bulk_selection_items WHERE snapshot_id = ? ORDER BY record_id`).bind(snapshotId).all<SnapshotItemRow>();

  return {
    snapshot: {
      id: row.id,
      module: row.module,
      action: row.action,
      selectionMode: row.selection_mode,
      membershipFilter: JSON.parse(row.membership_filter_json),
      filterFingerprint: row.filter_fingerprint,
      actorRef: row.actor_ref,
      matchedCount: Number(row.matched_count),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    },
    items: itemRows.results.map((item) => ({
      recordId: item.record_id,
      existsAtSnapshot: Boolean(item.exists_at_snapshot),
      capturedStatus: item.captured_status,
      capturedUpdatedAt: item.captured_updated_at,
      eligible: Boolean(item.eligible),
      skipReason: item.skip_reason,
    })),
  };
}
