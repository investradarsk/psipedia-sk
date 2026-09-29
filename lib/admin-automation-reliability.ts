export const adminAutomationAvailabilityStatuses = ["OK", "EMPTY", "PARTIAL", "UNAVAILABLE"] as const;

export type AdminAutomationAvailabilityStatus = (typeof adminAutomationAvailabilityStatuses)[number];
export type AdminAutomationReadAvailabilityStatus = Exclude<AdminAutomationAvailabilityStatus, "PARTIAL">;

export type AdminAutomationReadResult<T> = {
  key: string;
  status: AdminAutomationReadAvailabilityStatus;
  data: T;
  checkedAt: string;
  errorRef: string | null;
};

export type AdminAutomationAvailabilitySection = {
  key: string;
  status: AdminAutomationReadAvailabilityStatus;
  checkedAt: string;
  errorRef: string | null;
};

export type AdminAutomationReliabilitySummary = {
  status: AdminAutomationAvailabilityStatus;
  checkedAt: string;
  sections: AdminAutomationAvailabilitySection[];
  errorRefs: string[];
};

type ReadInput<T> = {
  key: string;
  load: () => Promise<T> | T;
  fallback: T;
  empty: (value: T) => boolean;
};

function automationErrorReference(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `AA-${stamp}-${random}`;
}

export async function readAdminAutomationData<T>(input: ReadInput<T>): Promise<AdminAutomationReadResult<T>> {
  const checkedAt = new Date().toISOString();
  try {
    const data = await input.load();
    return {
      key: input.key,
      status: input.empty(data) ? "EMPTY" : "OK",
      data,
      checkedAt,
      errorRef: null,
    };
  } catch (error) {
    const errorRef = automationErrorReference();
    console.error(JSON.stringify({
      event: "admin_automation_read_unavailable",
      scope: input.key,
      errorRef,
      errorType: error instanceof Error ? error.name : typeof error,
    }));
    return {
      key: input.key,
      status: "UNAVAILABLE",
      data: input.fallback,
      checkedAt,
      errorRef,
    };
  }
}

export function summarizeAdminAutomationReads(
  reads: ReadonlyArray<AdminAutomationReadResult<unknown>>,
): AdminAutomationReliabilitySummary {
  const sections = reads.map(({ key, status, checkedAt, errorRef }) => ({ key, status, checkedAt, errorRef }));
  const unavailableCount = sections.filter((section) => section.status === "UNAVAILABLE").length;
  const availableSections = sections.filter((section) => section.status !== "UNAVAILABLE");

  let status: AdminAutomationAvailabilityStatus;
  if (sections.length === 0 || (unavailableCount === 0 && availableSections.every((section) => section.status === "EMPTY"))) {
    status = "EMPTY";
  } else if (unavailableCount === sections.length) {
    status = "UNAVAILABLE";
  } else if (unavailableCount > 0) {
    status = "PARTIAL";
  } else {
    status = "OK";
  }

  return {
    status,
    checkedAt: sections.map((section) => section.checkedAt).sort().at(-1) ?? new Date().toISOString(),
    sections,
    errorRefs: sections.flatMap((section) => section.errorRef ? [section.errorRef] : []),
  };
}

// Read failures stay in structured logs only. Creating Attention Center rows from page
// refreshes would need a durable dedupe/cooldown contract; without it, transient failures
// could create an event storm. ADMIN-IA-2 can consume AdminAutomationReliabilitySummary
// directly without adding writes to these read-only pages.
