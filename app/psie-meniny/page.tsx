import Link from "next/link";
import { DogNameDayCalendar } from "@/components/dog-name-day-calendar";
import { getPublishedDogNameDaysForMonth } from "@/lib/dog-name-day-store";
import { resolveDogNameDayCalendar, todayInBratislava } from "@/lib/dog-name-day-calendar";
import styles from "@/components/dog-name-day-calendar.module.css";

export const dynamic = "force-dynamic";

type SearchParams = { mesiac?: string | string[]; den?: string | string[] };

export default async function DogNameDaysPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const today = todayInBratislava();
  const requestedMonth = typeof params.mesiac === "string" ? params.mesiac : "";
  const requestedDay = typeof params.den === "string" ? params.den : "";
  const { month } = resolveDogNameDayCalendar(requestedMonth, requestedDay, today);
  const records = await getPublishedDogNameDaysForMonth(Number(month.slice(5, 7)));

  return (
    <main className={styles.page} id="obsah">
      <div className={styles.container}>
        <nav className={styles.breadcrumbs} aria-label="Navigačná cesta">
          <Link href="/">Domov</Link><span aria-hidden="true">/</span><span>Psie meniny</span>
        </nav>
        <header className={styles.intro}>
          <span className={styles.eyebrow}>Kalendár psích mien</span>
          <h1>Psie meniny počas celého roka</h1>
          <p>Vyber deň, pozri si publikované psie mená a prechádzaj medzi mesiacmi. Kalendár vychádza z redakčne evidovaných údajov Psipedie.</p>
        </header>
        <DogNameDayCalendar today={today} month={month} day={requestedDay} records={records} />
      </div>
    </main>
  );
}
