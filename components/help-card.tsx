import Link from "next/link";
import { CalendarIcon, LocationIcon } from "@/components/help-public-icons";
import { PublicMediaFallback } from "@/components/public-visual-system";
import { PublicHelpProfileCard } from "@/components/public-visual-system/public-help-profile-card";
import { ImageDisplay } from "@/components/image-display";
import { publicLocationLabel, publicLocationValue } from "@/lib/public-location";
import { formatHelpDate, getHelpCategory, helpCaseHref, type PublicHelpCard } from "@/lib/help";
import styles from "./help-public.module.css";
import { HelpFinancialProgress } from "./help-financial-progress";

export function HelpCard({ item }: { item: PublicHelpCard }) {
  const category = getHelpCategory(item.category);
  const detailHref = helpCaseHref(item);
  const displayDate =
    item.category === "utulky" ? null : (item.reportedDate ?? item.updatedAt.slice(0, 10));
  const showOrganization = Boolean(
    item.organization?.trim() &&
      item.organization.trim().toLocaleLowerCase("sk") !==
        item.title.trim().toLocaleLowerCase("sk"),
  );
  const location = publicLocationLabel([
    publicLocationValue(item.city, "city"),
    publicLocationValue(item.region, "region"),
  ]);
  return (
    <PublicHelpProfileCard
      data-help-card
      data-public-card="help"
      data-public-card-emphasis={item.urgent && !item.resolved ? "urgent" : undefined}
      className={[
        item.urgent && !item.resolved ? styles.cardUrgent : "",
        item.resolved ? styles.cardResolved : "",
      ]
        .filter(Boolean)
        .join(" ")}
      href={detailHref}
      title={item.title}
      category={category?.singular ?? "Pomoc psom"}
      excerpt={item.excerpt}
      actionLabel={item.resolved ? "Pozrieť výsledok" : "Otvoriť detail"}
      badge={
        item.resolved ? (
          <span className={[styles.badge, styles.badgeResolved].join(" ")}>Vyriešené</span>
        ) : item.urgent ? (
          <span className={[styles.badge, styles.badgeUrgent].join(" ")}>Urgentné</span>
        ) : null
      }
      media={
        <Link href={detailHref} aria-label={"Otvoriť " + item.title}>
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
      meta={
        <>
          {showOrganization ? <p className={styles.organization}>{item.organization}</p> : null}
          {location ? (
            <p>
              <LocationIcon size={14} /> {location}
            </p>
          ) : null}
          {displayDate ? (
            <p>
              <CalendarIcon size={14} /> Aktualizované {formatHelpDate(displayDate)}
            </p>
          ) : null}
        </>
      }
      extras={
        <>
          {item.dogName || item.breed || item.ageNote ? (
            <p>{[item.dogName, item.breed, item.ageNote].filter(Boolean).join(" · ")}</p>
          ) : null}
          <HelpFinancialProgress item={item} compact />
        </>
      }
    />
  );
}
