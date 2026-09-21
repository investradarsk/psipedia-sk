import Link from "next/link";
import { CalendarIcon, LocationIcon } from "@/components/help-public-icons";
import { ArrowIcon, CheckIcon, PawMark } from "@/components/icons";
import {
  formatHelpAmount,
  formatHelpDate,
  getHelpCategory,
  helpCaseHref,
  helpProgress,
  type HelpCase,
} from "@/lib/help";
import styles from "./help-public.module.css";

export function HelpCard({ item }: { item: HelpCase }) {
  const category = getHelpCategory(item.category);
  const progress = helpProgress(item);
  const detailHref = helpCaseHref(item);
  const displayDate = item.reportedDate ?? item.updatedAt.slice(0, 10);
  const location = [item.city, item.region].filter(Boolean).join(" · ");

  return (
    <article data-help-card className={[styles.card, item.urgent && !item.resolved ? styles.cardUrgent : "", item.resolved ? styles.cardResolved : ""].filter(Boolean).join(" ")}>
      <Link className={styles.media} href={detailHref} aria-label={"Otvoriť " + item.title}>
        {item.imageUrl ? <img src={item.imageUrl} alt={item.dogName ? item.dogName + " – " + item.title : item.title} loading="lazy" decoding="async" /> : <span className={styles.mediaFallback} aria-hidden="true"><PawMark size={38} /></span>}
        <span className={styles.badges}>
          {item.resolved ? <b className={[styles.badge, styles.badgeResolved].join(" ")}>Vyriešené</b> : item.urgent ? <b className={[styles.badge, styles.badgeUrgent].join(" ")}>Urgentné</b> : null}
        </span>
      </Link>

      <div className={styles.cardBody}>
        <div className={styles.tags}>
          <span>{category?.singular ?? "Pomoc psom"}</span>
          {item.verified && item.category !== "zbierky" ? <span className={styles.verified}><CheckIcon size={14} /> Overené</span> : null}
        </div>
        <h3><Link href={detailHref}>{item.title}</Link></h3>
        {item.excerpt ? <p className={styles.excerpt}>{item.excerpt}</p> : null}

        <div className={styles.metaList}>
          {item.organization ? <span className={[styles.metaItem, styles.organization].join(" ")}>{item.organization}</span> : null}
          {location ? <span className={styles.metaItem}><LocationIcon size={16} /><span>{location}</span></span> : null}
          {displayDate ? <span className={styles.metaItem}><CalendarIcon size={16} /><span>Aktualizované {formatHelpDate(displayDate)}</span></span> : null}
        </div>

        {(item.dogName || item.breed || item.ageNote) ? <p className={styles.dogFacts}>{[item.dogName, item.breed, item.ageNote].filter(Boolean).join(" · ")}</p> : null}

        {(item.raisedAmount !== null || item.goalAmount !== null) ? <div className={styles.amounts}>
          {item.raisedAmount !== null ? <span>Vyzbierané <strong>{formatHelpAmount(item.raisedAmount)}</strong></span> : null}
          {item.goalAmount !== null ? <span>Cieľ <strong>{formatHelpAmount(item.goalAmount)}</strong></span> : null}
        </div> : null}

        {progress !== null ? <div className={styles.progress}>
          <div className={styles.progressTrack} role="progressbar" aria-label="Priebeh zbierky" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: String(progress) + "%" }} /></div>
          <p>{progress} % cieľa</p>
        </div> : null}

        <Link className={styles.cardAction} href={detailHref}>{item.resolved ? "Pozrieť výsledok" : "Otvoriť detail"} <ArrowIcon size={17} /></Link>
      </div>
    </article>
  );
}
