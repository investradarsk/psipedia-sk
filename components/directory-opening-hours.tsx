import { parseDirectoryOpeningHours } from "@/lib/directory-opening-hours";
import styles from "./directory-profile-detail.module.css";

/** Shared for every service category; never invent unavailable hours. */
export function DirectoryOpeningHours({ value }: { value: string }) {
  const days = parseDirectoryOpeningHours(value);
  return (
    <section className={`${styles.practical} ${styles.hoursPosition}`} aria-label="Otváracie alebo ordinačné hodiny">
      <h2 className={styles.singleHeading}>Ordinačné / otváracie hodiny</h2>
      {days ? (
        <dl className={styles.weekHours}>
          {days.map(({ day, hours }) => (
            <div className={styles.weekHoursRow} key={day}>
              <dt>{day}</dt>
              <dd>{hours}</dd>
            </div>
          ))}
        </dl>
      ) : <p className={styles.hours}>{value}</p>}
    </section>
  );
}
