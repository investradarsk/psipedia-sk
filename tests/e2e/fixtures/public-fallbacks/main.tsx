import { HomeLatestArticles } from "../../../../components/home-editorial";
import homeStyles from "../../../../app/home-v2.module.css";
import { ArticleCard } from "../../../../components/article-card";
import { ArticleListItem } from "../../../../components/article-list-item";
import { PublicArticleListItem } from "../../../../components/public-visual-system";
import { ArticleBlocks } from "../../../../components/article-blocks";
import { BreedComparison } from "../../../../components/breed-comparison";
import { PublicLocationMap } from "../../../../components/map/public-location-map";
import PartnerLoginPage from "../../../../app/partner/prihlasenie/page";
import type { ArticleListingCard } from "../../../../lib/content";
import type { BreedComparisonItem } from "../../../../lib/breed-store";
import "../../../../app/partner/partner.css";
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
  if (element.props.children) {
    const children = await resolveServerTree(element.props.children);
    return cloneElement(element, undefined, ...(Array.isArray(children) ? children : [children]));
  }
  return element;
}
async function renderServerTree(node: ReactNode) {
  createRoot(root).render(await resolveServerTree(node));
}
const article = {
  slug: "fixture-clanok",
  title: "Ako pripraviť psa na spoločné výlety a každodenné objavovanie sveta",
  category: "Výcvik",
  portalSection: "aktivity",
  excerpt: "Praktické rady pre spoločný čas so psom.",
  date: "3. novembra 2026",
  dateIso: "2026-11-03",
  image: "/images/events/defaults/preteky.webp",
  accent: "forest",
} as ArticleListingCard;
const mapItem = {
  id: "service:1",
  entityType: "service",
  name: "Veterinár v Nitre",
  subcategory: "veterinari",
  latitude: 48.31,
  longitude: 18.08,
  displayLocation: "Nitra",
  publicUrl: "/adresar/veterinari/fixture",
  precision: "EXACT",
} as unknown as import("../../../../lib/map-contract").MapItem;
if (view === "home-articles")
  createRoot(root).render(
    <main className={homeStyles.homeV2}>
      <HomeLatestArticles
        articles={
          Array.from({ length: 6 }, (_, i) => ({
            ...article,
            slug: `clanok-${i}`,
            title: i ? `Menší článok ${i}` : article.title,
          })) as import("../../../../lib/content").Article[]
        }
        sidebar={<div>Podujatia</div>}
      />
    </main>,
  );
else if (view === "articles")
  createRoot(root).render(
    <main className="shell">
      <div className="fixture-article-variants">
        <ArticleCard article={article} variant="featured" />
        <ArticleCard
          article={{ ...article, image: "/missing-fixture-article.webp" }}
          variant="grid"
        />
        <ArticleCard article={{ ...article, image: "" }} variant="row" listItem={false} />
      </div>
      <div data-row-adapters>
        <ArticleListItem article={article} listItem={false} />
        <PublicArticleListItem
          href="/fixture-clanok"
          title={article.title}
          topic="Výcvik"
          date={article.date}
          dateTime={article.dateIso}
          image={{ src: article.image || "", alt: "Výlet so psom" }}
          listItem={false}
        />
      </div>
      <ArticleBlocks
        blocks={[
          { id: "tip", type: "tip", content: "Tip z praxe: Začnite krátkou trasou." },
          {
            id: "warning",
            type: "warning",
            content: "Dôležité upozornenie: Vezmite dostatok vody.",
          },
        ]}
      />
    </main>,
  );
else if (view === "comparison")
  createRoot(root).render(
    <main className="shell">
      <BreedComparison
        breeds={
          [
            {
              slug: "plemeno-a",
              name: "Plemeno A",
              image: "/images/events/defaults/preteky.webp",
              fciGroup: 1,
              fciSection: "Pastierske psy",
              origin: "Slovensko",
              accent: "forest",
              size: "Stredné",
              weight: "25–30 kg",
              lifespan: "12–14 rokov",
              coat: "Srsť podľa zdroja",
              energy: 3,
              trainability: 3,
              family: 3,
              intro: "Profil A.",
              goodFor: [],
              consider: [],
            },
            {
              slug: "plemeno-b",
              name: "Plemeno B",
              image: "/images/events/defaults/preteky.webp",
              fciGroup: 1,
              fciSection: "Pastierske psy",
              origin: "Austrália",
              accent: "forest",
              size: "Stredné",
              weight:
                "Štandard FCI neurčuje záväzné hmotnostné rozpätie. Orientačne 16–23 kg podľa zdroja v profile.",
              lifespan:
                "Orientačne 12–16 rokov podľa veterinárneho zdroja; individuálna dĺžka života závisí od viacerých okolností.",
              coat: "Krátka srsť",
              energy: 4,
              trainability: 4,
              family: 4,
              intro: "Profil B.",
              goodFor: [],
              consider: [],
            },
          ] as BreedComparisonItem[]
        }
      />
    </main>,
  );
else if (view === "help-pages")
  createRoot(root).render(
    <main>
      <HelpBrowser
        items={Array.from({ length: 35 }, (_, i) => ({
          ...help,
          id: i + 1,
          slug: `pomoc-${i + 1}`,
          title: `Pomoc ${i + 1}`,
        }))}
        initialCategory="dobrovolnictvo"
        initialRegion="Nitriansky kraj"
        initialQuery="Pomoc"
        initialPage={Number(new URLSearchParams(location.search).get("page")) || 1}
      />
    </main>,
  );
else if (view === "detail-map")
  createRoot(root).render(
    <main className="shell">
      <PublicLocationMap
        title="Poloha"
        items={[mapItem]}
        googleApiKey="fixture-key"
        googleMapId="fixture-id"
        rendererEnabled
      />
    </main>,
  );
else if (view === "partner")
  await renderServerTree(
    await PartnerLoginPage({
      searchParams: Promise.resolve({
        google: new URLSearchParams(location.search).get("google") || undefined,
      }),
    }),
  );
else if (view === "adoption")
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
          services: ["Legacy 1", "Legacy 2"],
          breeds: [],
          fciGroups: [],
          organizations: [],
          profileTypes: ["Psí salón / grooming"],
          canonicalServices: [{ id: "svc.physio.hydrotherapy", label: "Hydroterapia" }],
        },
      } as unknown as Parameters<typeof DirectoryPage>[0]["result"],
      filters: {
        query: "",
        category: "fyzioterapia",
        region: "",
        district: "",
        city: "",
        service: new URLSearchParams(location.search).get("service") ?? "",
        breed: "",
        fciGroup: "",
        organization: "",
        profileType: new URLSearchParams(location.search).get("type") ?? "",
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
