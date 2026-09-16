export const BULK_MODULES = ["directory", "articles"] as const;
export type BulkModule = (typeof BULK_MODULES)[number];

export const BULK_ACTIONS = ["publish", "move-to-draft"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export const BULK_SELECTION_MODES = ["explicit", "all-matching"] as const;
export type BulkSelectionMode = (typeof BULK_SELECTION_MODES)[number];

export type BulkSkipReason =
  | "already-target-state"
  | "record-no-longer-exists"
  | "invalid-lifecycle"
  | "record-changed-since-snapshot";

export type BulkResolvedRecord = {
  id: string;
  status: string;
  updatedAt: string | null;
};

export type BulkEligibility = {
  eligible: boolean;
  reason?: BulkSkipReason;
};

export type BulkMaterializedItem = {
  recordId: string;
  existsAtSnapshot: boolean;
  capturedStatus: string | null;
  capturedUpdatedAt: string | null;
  eligible: boolean;
  skipReason: BulkSkipReason | null;
};

export type BulkSkipSummary = {
  reason: BulkSkipReason;
  count: number;
};

export type BulkPreflightRequest =
  | {
      module: BulkModule;
      action: BulkAction;
      selection: {
        mode: "explicit";
        ids: number[];
        filter?: unknown;
      };
    }
  | {
      module: BulkModule;
      action: BulkAction;
      selection: {
        mode: "all-matching";
        filter: unknown;
      };
    };

export class BulkPreflightError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "invalid-request") {
    super(message);
    this.name = "BulkPreflightError";
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseBulkPreflightRequest(payload: unknown): BulkPreflightRequest {
  if (!isRecord(payload)) throw new BulkPreflightError("Neplatná preflight požiadavka.");

  if (payload.module !== "directory" && payload.module !== "articles") {
    throw new BulkPreflightError("Neplatný bulk modul.", 400, "invalid-module");
  }
  const bulkModule: BulkModule = payload.module;

  if (payload.action !== "publish" && payload.action !== "move-to-draft") {
    throw new BulkPreflightError("Neplatná bulk akcia.", 400, "invalid-action");
  }
  const action: BulkAction = payload.action;

  const selection = payload.selection;
  if (!isRecord(selection)) {
    throw new BulkPreflightError("Chýba platný výber.", 400, "invalid-selection");
  }

  if (selection.mode === "explicit") {
    if (!Array.isArray(selection.ids) || selection.ids.length === 0 || selection.ids.length > 500) {
      throw new BulkPreflightError("Explicitný výber musí obsahovať 1 až 500 ID.", 400, "invalid-selection");
    }
    const ids = selection.ids.map((value) => {
      if (!Number.isSafeInteger(value) || Number(value) <= 0) {
        throw new BulkPreflightError("Výber obsahuje neplatné ID.", 400, "invalid-selection-id");
      }
      return Number(value);
    });
    return {
      module: bulkModule,
      action,
      selection: {
        mode: "explicit",
        ids: [...new Set(ids)],
        filter: selection.filter,
      },
    };
  }

  if (selection.mode === "all-matching") {
    if (bulkModule !== "directory") {
      throw new BulkPreflightError(
        "All-matching výber nie je pre tento modul podporovaný.",
        400,
        "unsupported-selection-mode",
      );
    }
    if (!isRecord(selection.filter)) {
      throw new BulkPreflightError("All-matching výber musí obsahovať filter.", 400, "invalid-selection");
    }
    return {
      module: bulkModule,
      action,
      selection: { mode: "all-matching", filter: selection.filter },
    };
  }

  throw new BulkPreflightError("Neplatný režim výberu.", 400, "invalid-selection-mode");
}

export function materializeBulkSelection(
  requestedIds: readonly string[],
  records: readonly BulkResolvedRecord[],
  evaluate: (record: BulkResolvedRecord) => BulkEligibility,
): BulkMaterializedItem[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  return requestedIds.map((recordId) => {
    const record = byId.get(recordId);
    if (!record) {
      return {
        recordId,
        existsAtSnapshot: false,
        capturedStatus: null,
        capturedUpdatedAt: null,
        eligible: false,
        skipReason: "record-no-longer-exists",
      };
    }
    const eligibility = evaluate(record);
    return {
      recordId,
      existsAtSnapshot: true,
      capturedStatus: record.status,
      capturedUpdatedAt: record.updatedAt,
      eligible: eligibility.eligible,
      skipReason: eligibility.eligible ? null : eligibility.reason ?? "invalid-lifecycle",
    };
  });
}

export function summarizeBulkSelection(items: readonly BulkMaterializedItem[]) {
  const eligible = items.filter((item) => item.eligible).length;
  const skippedItems = items.filter((item) => !item.eligible);
  const counts = new Map<BulkSkipReason, number>();
  for (const item of skippedItems) {
    const reason = item.skipReason ?? "invalid-lifecycle";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return {
    matched: items.length,
    eligible,
    wouldBeSkipped: skippedItems.length,
    skips: [...counts].map(([reason, count]) => ({ reason, count })),
  };
}

export function revalidateMaterializedSelection(
  captured: readonly BulkMaterializedItem[],
  currentRecords: readonly BulkResolvedRecord[],
  evaluate: (record: BulkResolvedRecord) => BulkEligibility,
): BulkMaterializedItem[] {
  const currentById = new Map(currentRecords.map((record) => [record.id, record]));
  return captured.map((item) => {
    const current = currentById.get(item.recordId);
    if (!current) {
      return { ...item, eligible: false, skipReason: "record-no-longer-exists" };
    }
    if (
      !item.existsAtSnapshot
      || item.capturedStatus !== current.status
      || item.capturedUpdatedAt !== current.updatedAt
    ) {
      return {
        ...item,
        eligible: false,
        skipReason: "record-changed-since-snapshot",
      };
    }
    const eligibility = evaluate(current);
    return {
      ...item,
      eligible: eligibility.eligible,
      skipReason: eligibility.eligible ? null : eligibility.reason ?? "invalid-lifecycle",
    };
  });
}
