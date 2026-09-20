import { AD_LABEL, type AdPlacementId } from "@/lib/monetization";
import { getActiveCampaignForPlacement } from "@/lib/monetization-store";
import { AdExposureTracker, trackedAdClick } from "./ad-exposure-tracker";
import styles from "./ad-slot.module.css";

function AdLink({
  href, campaignId, placementId, children,
}: {
  href: string;
  campaignId: string;
  placementId: AdPlacementId;
  children: React.ReactNode;
}) {
  return (
    <a
      className={styles.card}
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      onClick={() => trackedAdClick(campaignId, placementId)}
      aria-label={`${AD_LABEL}: ${String((children as unknown) ?? "")}`}
    >
      {children}
    </a>
  );
}

export async function AdSlot({ placementId }: { placementId: AdPlacementId }) {
  const campaign = await getActiveCampaignForPlacement(placementId);
  if (!campaign) return null;

  return (
    <aside className={styles.slot} aria-label={AD_LABEL} data-ad-placement={placementId}>
      <AdExposureTracker campaignId={campaign.id} placementId={placementId} />
      <AdLink href={campaign.destinationUrl} campaignId={campaign.id} placementId={placementId}>
        {campaign.imageUrl ? (
          <img className={styles.media} src={campaign.imageUrl} alt={campaign.imageAlt || ""} loading="lazy" decoding="async" />
        ) : null}
        <span className={styles.copy}>
          <span className={styles.label}>{AD_LABEL}</span>
          <strong className={styles.headline}>{campaign.headline}</strong>
          {campaign.copy ? <span className={styles.body}>{campaign.copy}</span> : null}
        </span>
      </AdLink>
    </aside>
  );
}
