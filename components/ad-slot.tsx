import { AD_LABEL, type AdPlacementId } from "@/lib/monetization";
import { getActiveCampaignForPlacement } from "@/lib/monetization-store";
import { AdExposureTracker } from "./ad-exposure-tracker";
import { TrackedAdLink } from "./tracked-ad-link";
import styles from "./ad-slot.module.css";

export async function AdSlot({ placementId }: { placementId: AdPlacementId }) {
  const campaign = await getActiveCampaignForPlacement(placementId);
  if (!campaign) return null;

  return (
    <aside className={styles.slot} aria-label={AD_LABEL} data-ad-placement={placementId}>
      <AdExposureTracker campaignId={campaign.id} placementId={placementId} />
      <TrackedAdLink
        className={styles.card}
        href={campaign.destinationUrl}
        campaignId={campaign.id}
        placementId={placementId}
        ariaLabel={`${AD_LABEL}: ${campaign.headline}`}
      >
        <img className={styles.media} src={campaign.imageUrl} alt={campaign.imageAlt} loading="lazy" decoding="async" />
        <span className={styles.copy}>
          <span className={styles.label}>{AD_LABEL}</span>
          <strong className={styles.headline}>{campaign.headline}</strong>
          {campaign.copy ? <span className={styles.body}>{campaign.copy}</span> : null}
        </span>
      </TrackedAdLink>
    </aside>
  );
}
