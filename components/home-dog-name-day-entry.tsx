import Link from "next/link";
import { getPublishedDogNameDaysForDate } from "@/lib/dog-name-day-store";
import { slovakNameDayDateLabel, todayInBratislava } from "@/lib/dog-name-day-calendar";
import styles from "./dog-name-day-calendar.module.css";

export async function HomeDogNameDayEntry() {
  const [names, today] = await Promise.all([
    getPublishedDogNameDaysForDate(),
    Promise.resolve(todayInBratislava()),
  ]);

  return (
    <section className={"shell " + styles.homeEntry} data-home-dog-name-day aria-labelledby="home-dog-name-day-title">
      <div className={styles.homeCopy}>
        <span className={styles.eyebrow}>Každý deň</span>
        <h2 id="home-dog-name-day-title">Psie meniny</h2>
        <p>
          <span className={styles.homeDate}>{slovakNameDayDateLabel(today)}</span>
          <span className={styles.homeNames}>
            {names.length ? names.join(", ") : "Na dnes nemáme evidované publikované meniny."}
          </span>
        </p>
      </div>
      <Link className={styles.homeLink} href="/psie-meniny">
        Otvoriť mesačný kalendár <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
