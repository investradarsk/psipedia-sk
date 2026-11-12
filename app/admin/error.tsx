"use client";

import { useEffect } from "react";
import { AdminErrorRecovery } from "@/components/admin-recovery-actions";

/** A failed Admin route must always show an explicit escape, never a white page. */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Never log a raw response, user details or a potentially sensitive stack.
    console.error("admin_route_render_failed", error.digest ?? error.name);
  }, [error]);

  return <AdminErrorRecovery error={error} reset={reset} />;
}
