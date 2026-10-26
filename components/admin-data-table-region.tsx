import type { ReactNode } from "react";

/** Keep scrollable, keyboard-focusable admin result tables on one accessibility contract.
 * Each module still owns its columns, row actions, data source and table CSS.
 */
export function AdminDataTableRegion({ label, className, children }: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return <div className={className} role="region" aria-label={label} tabIndex={0}>{children}</div>;
}
