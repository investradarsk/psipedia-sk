import { AdoptionCatalog } from "../../../../components/adoption-catalog";
import { DirectoryPage } from "../../../../components/directory-page";
import { HomePortalSearch } from "../../../../components/home-portal-search";
import eventStyles from "../../../../components/events-public.module.css";
import { EventCalendar } from "../../../../components/event-calendar";
import { UnifiedSectionHero } from "../../../../components/public-visual-system/unified-section-hero";
import { PublicContextBanner } from "../../../../components/public-visual-system/public-context-banner";
import { PublicMagazineBanner } from "../../../../components/public-visual-system/public-magazine-banner";
import { DetailContactsCard } from "../../../../components/detail-primitives/detail-primitives";
import { HelpDetail } from "../../../../components/help-detail";
import { HelpBrowser } from "../../../../components/help-browser";
import type { HelpCase } from "../../../../lib/help";
import type { ResolvedSectionVisual } from "../../../../lib/section-visual-contract";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { EventImage } from "../../../../components/event-image";
import { EventDetail } from "../../../../components/event-detail";
import { HelpCard } from "../../../../components/help-card";
import { MapExperience } from "../../../../components/map/map-experience";
import { useState, isValidElement, cloneElement, type ReactNode, type ReactElement } from "react";
import type { DogEvent } from "../../../../lib/events";
import type { PublicHelpCard } from "../../../../lib/help";
import "../../../../app/globals.css";
import "../../../../app/design-system.css";
import "./style.css";

const photo = "/images/events/defaults/preterky-fixture-missing.webp";
const help = {
  id: 1,
  slug: "fixture",
  title: "Pomoc labkám",
  category: "dobrovolnictvo",
  excerpt: "Venčenie a vecná pomoc útulku.",
  organization: "Útulok",
  updatedAt: "2026-11-03T12:00:00Z",
  city: "Nitra",
  region: "Nitriansky kraj",
  resolved: false,
  urgent: false,
  raisedAmount: 0,
  goalAmount: 0,
  imageUrl: null,
} as PublicHelpCard;
const event = {
  id: 1,
  slug: "fixture",
  title: "Podujatie pre milovníkov psov",
  eventType: "Preteky",
  city: "Nitra",
  region: "Nitriansky kraj",
  startDate: "2030-11-06",
  endDate: "2030-11-08",
  description: "Praktické informácie pre návštevníkov.",
  imageUrl: photo,
  updatedAt: "2026-11-03T12:00:00Z",
} as DogEvent;
function HydrationImages() {
  return (
    <div className="image-grid">
      {["crop", "natural", "blur"].map((mode) => (
        <div className="image-slot" data-cached={mode} key={mode}>
          <EventImage
            imageUrl={photo}
            eventType="Preteky"
            alt="Fotografia podujatia"
            loading="eager"
            context={mode === "natural" ? "detail" : "thumbnail"}
            config={{ mode: mode as "crop", x: 50, y: 50, zoom: 1 }}
          />
        </div>
      ))}
    </div>
  );
}
function Examples() {
  const [broken, setBroken] = useState(false);
  return (
    <main>
      <h1>Izolovaná kontrola verejných komponentov</h1>
      <button onClick={() => setBroken(true)}>Pokaziť fotografiu po načítaní</button>
      <div className="image-slot" data-runtime-image>
        <EventImage
          imageUrl={broken ? photo : "/images/events/defaults/preteky.webp"}
          eventType="Preteky"
          loading="eager"
          alt="Podujatie"
        />
      </div>
      <div className="help-grid">
        {["utulky", "dobrovolnictvo", "docasna-opatera", "zbierky"].map((category, i) => (
          <HelpCard
            key={category}
            item={{ ...help, id: i + 1, category: category as "utulky", title: category }}
          />
        ))}
        <HelpCard
          item={{
            ...help,
            id: 5,
            category: "zbierky",
            title: "Skutočná finančná zbierka",
            goalAmount: 1000,
            raisedAmount: 0,
          }}
        />
        <HelpCard item={{ ...help, id: 6, title: "Zlyhaná fotografia", imageUrl: photo }} />
        <HelpCard
          item={{
            ...help,
            id: 7,
            title: "Platná fotografia",
            imageUrl: "/images/events/defaults/preteky.webp",
          }}
        />
      </div>
    </main>
  );
}
const root = document.getElementById("root")!;
const view = new URLSearchParams(location.search).get("view");
const visual = {
  visualKey: "section.podujatia",
  source: "fixture",
  imageUrl: "/images/events/defaults/preteky.webp",
  altText: "Ilustračný obrázok",
  desktopCrop: { x: 50, y: 50, zoom: 1 },
  mobileCrop: { x: 50, y: 50, zoom: 1 },
} as unknown as ResolvedSectionVisual;
const closedCase = {
  ...help,
  category: "zbierky",
  title: "Reina – ukončená výzva",
  excerpt: "Ukončená zbierka na operáciu Reiny.",
  description: "Výzva je ukončená a nejde o aktuálnu žiadosť o príspevky.",
  contactNote: "Organizátor uvádza verejný zdroj.",
  actionLabel: "Podporiť",
  actionUrl: "https://example.org/archive",
  verified: true,
  urgent: true,
  resolved: false,
  reportedDate: null,
  deadlineDate: null,
  locationNote: "",
  imageKey: null,
  dogName: "",
  breed: "",
  ageNote: "",
  createdAt: help.updatedAt,
  publishedAt: help.updatedAt,
  createdBy: "fixture",
  updatedBy: "fixture",
  seo: {},
} as HelpCase;
async function resolveServerTree(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveServerTree));
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (typeof element.type === "function" && element.type.constructor.name === "AsyncFunction")
    return resolveServerTree(
      await (element.type as (props: unknown) => Promise<ReactNode>)(element.props),
    );
  if (element.props.children)
    return cloneElement(element, undefined, await resolveServerTree(element.props.children));
  return element;
}
async function renderServerTree(node: ReactNode) {
  createRoot(root).render(await resolveServerTree(node));
}
if (view === "adoption")
  await renderServerTree(
    await AdoptionCatalog({
      result: {
        items: [],
        pagination: { page: 1, pageSize: 24, total: 0, totalPages: 1 },
      } as unknown as Parameters<typeof AdoptionCatalog>[0]["result"],
      filters: {
        q: "",
        region: "",
        sex: "",
        age: "",
        size: "",
        status: "",
        children: false,
        dogs: false,
        cats: false,
        sort: "newest",
      } as Parameters<typeof AdoptionCatalog>[0]["filters"],
      breeds: { available: true, options: [] },
    }),
  );
else if (view === "directory")
  await renderServerTree(
    await DirectoryPage({
      result: {
        profiles: [],
        total: 0,
        page: 1,
        totalPages: 1,
        pageSize: 24,
        options: {
          regions: [],
          districts: [],
          cities: [],
          services: [],
          breeds: [],
          fciGroups: [],
          organizations: [],
          profileTypes: [],
          canonicalServices: [],
        },
      } as unknown as Parameters<typeof DirectoryPage>[0]["result"],
      filters: {
        query: "",
        category: "fyzioterapia",
        region: "",
        district: "",
        city: "",
        service: "",
        breed: "",
        fciGroup: "",
        organization: "",
        profileType: "",
        canonicalService: "",
        facets: {},
        page: 1,
        sort: "recommended",
      },
      initialCategory: "fyzioterapia",
    }),
  );
else if (view === "calendar")
  createRoot(root).render(
    <main className="shell">
      {await UnifiedSectionHero({
        title: "Podujatia",
        intro: "Vyber si termín a miesto podujatia.",
        visual,
        portalSearchSlot: (
          <HomePortalSearch
            action="/podujatia"
            id="fixture-event-search"
            title="Nájdi podujatie"
            shortcuts={[]}
          />
        ),
      })}
      <EventCalendar
        events={[event]}
        today="2030-11-03"
        initialCalendarMonth="2030-11"
        calendarSummaries={[{ date: "2030-11-06", count: 1, types: ["Preteky"] }]}
        listing={{ total: 1, page: 1, pages: 1 }}
        afterCalendar={
          <section className={eventStyles.calendarOrganizer}>
            <PublicContextBanner
              title="Organizuješ podujatie?"
              ctaHref="/podujatia/pridat-podujatie"
              ctaLabel="Pridať podujatie"
              inline
            />
          </section>
        }
      />
    </main>,
  );
else if (view === "banners")
  createRoot(root).render(
    <main className="shell">
      <h1>Spoločné bannery a kontakty</h1>
      <PublicMagazineBanner
        title="Veterinári pre tvojho psa"
        description="Vyhľadaj služby vo svojom okolí."
        label="Zobraziť veterinárov"
        href="/adresar/veterinari"
        testId="fixture"
      />
      <PublicContextBanner
        title="Veterinári pre tvojho psa"
        text="Vyhľadaj služby vo svojom okolí."
        ctaLabel="Zobraziť veterinárov"
        ctaHref="/adresar/veterinari"
        tone="sage"
        inline
      />
      <PublicContextBanner
        title="Pomoc psom"
        text="Každá pomoc sa počíta."
        ctaLabel="Ako pomôcť"
        ctaHref="/pomoc-psom"
        tone="forest"
      />
      <DetailContactsCard title="Kontakty" contacts={[]} note="Poznámka bez priameho kontaktu." />
      <DetailContactsCard
        title="Kontakty služby"
        contacts={[{ label: "Telefón", value: <a href="tel:+421900000000">+421 900 000 000</a> }]}
      />
    </main>,
  );
else if (view === "closed") createRoot(root).render(<HelpDetail item={closedCase} />);
else if (view === "help-filters")
  createRoot(root).render(
    <main>
      <HelpBrowser items={[help, closedCase]} initialCategory="all" />
    </main>,
  );
else if (view === "hydrate") {
  root.innerHTML = renderToString(<HydrationImages />);
  const button = document.createElement("button");
  button.textContent = "Hydratovať";
  button.onclick = () => {
    hydrateRoot(root, <HydrationImages />);
    button.remove();
  };
  root.insertAdjacentElement("beforebegin", button);
} else if (view === "map")
  createRoot(root).render(
    <main>
      <h1>Mapa</h1>
      <MapExperience googleApiKey="fixture-key" googleMapId="fixture-id" rendererEnabled />
    </main>,
  );
else if (view === "event")
  createRoot(root).render(
    <EventDetail
      event={event}
      related={[{ ...event, id: 2, title: "Ďalšie podujatie", slug: "dalsie" }]}
    />,
  );
else createRoot(root).render(<Examples />);
