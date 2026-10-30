import type { Metadata } from "next";
import Link from "next/link";
import { buildListingPageMetadata } from "@/lib/listing-seo";
import { DogNameDayCalendar } from "@/components/dog-name-day-calendar";
import { getPublishedDogNameDaysForMonth, searchPublishedDogNameDays } from "@/lib/dog-name-day-store";
import { resolveDogNameDayCalendar, todayInBratislava } from "@/lib/dog-name-day-calendar";
import styles from "@/components/dog-name-day-calendar.module.css";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  return buildListingPageMetadata({
    title: "Psie meniny – kalendár mien pre psov",
    description: "Pozrite si kalendár psích menín na celý rok. Vyhľadajte, kedy má váš pes meniny, a preskúmajte mená podľa dňa a mesiaca.",
    path: "/psie-meniny",
    searchParams: await searchParams,
  });
}

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
  const requestedName = typeof params.meno === "string" ? params.meno.trim().slice(0, 80) : "";
  const [records, matchingNames] = await Promise.all([
    getPublishedDogNameDaysForMonth(Number(month.slice(5, 7))),
    searchPublishedDogNameDays(requestedName),
  ]);

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
        <section className={styles.nameSearch} aria-label="Vyhľadanie psích menín podľa mena">
          <form action="/psie-meniny" method="get" role="search">
            <label htmlFor="dog-name-search">Vyhľadať psie meno</label>
            <div className={styles.nameSearchControls}>
              <input id="dog-name-search" name="meno" type="search"
                placeholder="Napr. Hrom, Pipo…" defaultValue={requestedName}
                maxLength={80} minLength={2} autoComplete="off" enterKeyHint="search" />
              <button type="submit">Hľadať</button>
            </div>
          </form>
          {requestedName.length >= 2 ? (
            <div className={styles.nameSearchResults} aria-live="polite">
              <strong>{matchingNames.length ? "Nájdené meniny" : "Meno sme medzi publikovanými meninami nenašli."}</strong>
              {matchingNames.length ? (
                <ul>{matchingNames.map((record) => {
                  const dayDate = `${month.slice(0, 4)}-${String(record.month).padStart(2, "0")}-${String(record.day).padStart(2, "0")}`;
                  const monthDate = dayDate.slice(0, 7);
                  return <li key={dayDate + record.name}>
                    <Link href={`/psie-meniny?mesiac=${monthDate}&den=${dayDate}`}>
                      <span>{record.name}</span>
                      <span>{record.day}. {record.month}. <span aria-hidden="true">→</span></span>
                    </Link>
                  </li>;
                })}</ul>
              ) : null}
            </div>
          ) : null}
        </section>
        <DogNameDayCalendar today={today} month={month} day={requestedDay} records={records} />
      </div>
    </main>
  );
}
