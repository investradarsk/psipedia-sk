import { cache } from "react";
import { loadExactAdminAttentionSummary } from "@/lib/admin-attention-queue-store";

/**
 * One canonical count probe per React server request, never a persistent cache.
 * A refresh, mutation or new navigation creates a fresh RSC request and a
 * fresh database read. No per-user data crosses request boundaries.
 */
export const loadRequestAdminAttentionSummary = cache(
  () => loadExactAdminAttentionSummary(),
);
