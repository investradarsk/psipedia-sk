import Link from "next/link";
import { CalendarIcon, LocationIcon } from "@/components/help-public-icons";
import { PublicMediaFallback } from "@/components/public-visual-system";
import { PublicHelpProfileCard } from "@/components/public-visual-system/public-help-profile-card";
import { ImageDisplay } from "@/components/image-display";
import { publicLocationLabel, publicLocationValue } from "@/lib/public-location";
import {
  formatHelpAmount,
  formatHelpDate,
  getHelpCategory,
  helpCaseHref,
  helpProgress,
  type PublicHelpCard,
} from "@/lib/help";
import styles from "./help-public.module.css";

export function HelpCard({ item }: { item: PublicHelpCard }) {
  const category = getHelpCategory(item.category);
  const progress = helpProgress(item);
  const detailHref = helpCaseHref(item);
  const displayDate = item.reportedDate ?? item.updatedAt.slice(0, 10);
  const location = publicLocationLabel([publicLocationValue(item.city, "city"), publicLocationValue(item.region, "region")]);
  return (
    <PublicHelpProfileCard
      data-help-card
      data-public-card="help"
      data-public-card-emphasis={item.urgent && !item.resolved ? "urgent" : undefined}
      className={[item.urgent && !item.resolved ? styles.cardUrgent : "", item.resolved ? styles.cardResolved : ""].filter(Boolean).join(" ")}
      href={detailHref}
      title={item.title}
      category={category?.singular ?? "Pomoc psom"}
      excerpt={item.excerpt}
      actionLabel={item.resolved ? "Pozrieť výsledok" : "Otvoriť detail"}
      badge={item.resolved
        ? <span className={[styles.badge, styles.badgeResolved].join(" ")}>Vyriešené</span>
        : item.urgent ? <span className={[styles.badge, styles.badgeUrgent].join(" ")}>Urgentné</span> : null}
      media={<Link href={detailHref} aria-label={"Otvoriť " + item.title}>
        {item.imageUrl
          ? <ImageDisplay roleHint="generic" fallbackOnError context="thumbnail" config={item.thumbnailImageDisplay} src={item.imageUrl} alt={item.dogName ? item.dogName + " – " + item.title : item.title} loading="lazy" decoding="async" />
          : <PublicMediaFallback appearance="context" decorative />}
      </Link>}
      meta={<>
        {item.organization ? <p className={styles.organization}>{item.organization}</p> : null}
        {location ? <p><LocationIcon size={14} /> {location}</p> : null}
        {displayDate ? <p><CalendarIcon size={14} /> Aktualizované {formatHelpDate(displayDate)}</p> : null}
      </>}
      extras={<>
        {(item.dogName || item.breed || item.ageNote) ? <p>{[item.dogName, item.breed, item.ageNote].filter(Boolean).join(" · ")}</p> : null}
        {(item.raisedAmount !== null || item.goalAmount !== null) ? <div className={styles.amounts}>
          {item.raisedAmount !== null && <span>Vyzbierané <strong>{formatHelpAmount(item.raisedAmount)}</strong></span>}
          {item.goalAmount !== null && <span>Cieľ <strong>{formatHelpAmount(item.goalAmount)}</strong></span>}
        </div> : null}
        {progress !== null && <div className={styles.progress}>
          <div className={styles.progressTrack} role="progressbar" aria-label="Priebeh zbierky" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: progress + "%" }} /></div>
          <p>{progress} % cieľa</p>
        </div>}
      </>}
    />
  );
}
