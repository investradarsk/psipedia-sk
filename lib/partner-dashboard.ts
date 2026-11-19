import type { PartnerManagedResource } from "./partner-platform";

type Resource = Pick<PartnerManagedResource, "entityType">;
type Claim = { id: string; name: string; status: string; createdAt: string };
type NewProfile = { id: string; displayName: string; status: string; statusLabel: string; createdAt: string };
type EventSubmission = { id: string; title: string; status: string; statusLabel: string; createdAt: string };
type HelpSubmission = { id: string; title: string; status: string; statusLabel: string; createdAt: string };
type ProfileChange = { id: string; resourceName: string; status: string; statusLabel: string; createdAt: string };

export type PartnerDashboardRequest = {
  id: string;
  type: "claim" | "new-profile" | "event" | "help" | "profile-change";
  category: string;
  title: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  pending: boolean;
};

const pendingStatuses = new Set(["PENDING", "SUBMITTED", "PENDING_REVIEW", "QUARANTINED"]);
const claimStatusLabels: Record<string, string> = {
  PENDING: "Čaká na schválenie",
  APPROVED: "Schválené",
  REJECTED: "Zamietnuté",
  CANCELLED: "Zrušené",
};

/** Only presentation data: all input records are already scoped to the signed-in account. */
export function buildPartnerDashboardSummary(input: {
  resources: readonly Resource[];
  claims: readonly Claim[];
  newProfiles: readonly NewProfile[];
  eventSubmissions: readonly EventSubmission[];
  profileChanges: readonly ProfileChange[];
  helpSubmissions?: readonly HelpSubmission[];
}) {
  const requests: PartnerDashboardRequest[] = [
    ...input.claims.map((item) => ({
      id: item.id, type: "claim" as const, category: "Prevzatie profilu",
      title: item.name, status: item.status,
      statusLabel: claimStatusLabels[item.status] ?? item.status,
      createdAt: item.createdAt, pending: pendingStatuses.has(item.status),
    })),
    ...input.newProfiles.map((item) => ({
      id: item.id, type: "new-profile" as const, category: "Nový profil",
      title: item.displayName, status: item.status, statusLabel: item.statusLabel,
      createdAt: item.createdAt, pending: pendingStatuses.has(item.status),
    })),
    ...input.eventSubmissions.map((item) => ({
      id: item.id, type: "event" as const, category: "Podujatie",
      title: item.title, status: item.status, statusLabel: item.statusLabel,
      createdAt: item.createdAt, pending: pendingStatuses.has(item.status),
    })),
    ...(input.helpSubmissions ?? []).map((item) => ({
      id: item.id, type: "help" as const, category: "Nová pomoc psom",
      title: item.title, status: item.status, statusLabel: item.statusLabel,
      createdAt: item.createdAt, pending: pendingStatuses.has(item.status),
    })),
    ...input.profileChanges.map((item) => ({
      id: item.id, type: "profile-change" as const, category: "Úprava profilu",
      title: item.resourceName, status: item.status, statusLabel: item.statusLabel,
      createdAt: item.createdAt, pending: pendingStatuses.has(item.status),
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id));

  return {
    profiles: input.resources.filter((item) => item.entityType !== "MANAGED_EVENT").length,
    events: input.resources.filter((item) => item.entityType === "MANAGED_EVENT").length,
    pendingRequests: requests.filter((request) => request.pending).length,
    recentRequests: requests.slice(0, 4),
  };
}
