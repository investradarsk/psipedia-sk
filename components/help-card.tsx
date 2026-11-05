import { applyHelpLifecycle } from "@/lib/help-lifecycle";
import Link from "next/link";
import { PublicMediaFallback } from "@/components/public-visual-system";
import { PublicHelpProfileCard } from "@/components/public-visual-system/public-help-profile-card";
import { ImageDisplay } from "@/components/image-display";
import { publicLocationLabel, publicLocationValue } from "@/lib/public-location";
import { getHelpCategory, helpCaseHref, type PublicHelpCard } from "@/lib/help";
import styles from "./help-public.module.css";

/** The category listing intentionally uses the exact same compact card as
 * the Pomoc psom landing; detailed facts live on the profile page. */
export function HelpCard({ item: rawItem }: { item: PublicHelpCard }) {
  const item = applyHelpLifecycle(rawItem);
  const category = getHelpCategory(item.category);
  const href = helpCaseHref(item);
  const showOrganization = Boolean(
    item.organization?.trim() &&
      item.organization.trim().toLocaleLowerCase("sk") !==
        item.title.trim().toLocaleLowerCase("sk"),
  );
  const location = publicLocationLabel([
    publicLocationValue(item.city, "city"),
    publicLocationValue(item.region, "region"),
  ]);
  const meta = [showOrganization ? item.organization : null, location]
    .filter(Boolean)
    .join(" · ");

  return (
    <PublicHelpProfileCard
      data-help-card
      data-public-card="help"
      data-public-card-emphasis={item.urgent && !item.resolved ? "urgent" : undefined}
      className={[
        item.urgent && !item.resolved ? styles.cardUrgent : "",
        item.resolved ? styles.cardResolved : "",
      ].filter(Boolean).join(" ")}
      href={href}
      title={item.title}
      category={category?.singular ?? "Pomoc psom"}
      meta={meta}
      excerpt={item.excerpt}
      badge={
        item.resolved ? (
          <span className={[styles.badge, styles.badgeResolved].join(" ")}>Vyriešené</span>
        ) : item.urgent ? (
          <span className={[styles.badge, styles.badgeUrgent].join(" ")}>Urgentné</span>
        ) : null
      }
      media={
        <Link href={href} aria-label={"Otvoriť " + item.title}>
          {item.imageUrl ? (
            <ImageDisplay
              roleHint="generic"
              fallbackOnError
              context="thumbnail"
              config={item.thumbnailImageDisplay}
              src={item.imageUrl}
              alt={item.dogName ? item.dogName + " – " + item.title : item.title}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <PublicMediaFallback appearance="context" decorative />
          )}
        </Link>
      }
    />
  );
}
