"use client";

import type { ReactNode } from "react";
import type { AdPlacementId } from "@/lib/monetization";
import { trackedAdClick } from "./ad-exposure-tracker";

export function TrackedAdLink({
  className,
  href,
  campaignId,
  placementId,
  ariaLabel,
  children,
}: {
  className: string;
  href: string;
  campaignId: string;
  placementId: AdPlacementId;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      onClick={() => trackedAdClick(campaignId, placementId)}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  );
}
