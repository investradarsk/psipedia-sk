import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { EventImage } from "../../../../components/event-image";
import { EventDetail } from "../../../../components/event-detail";
import { HelpCard } from "../../../../components/help-card";
import { MapExperience } from "../../../../components/map/map-experience";
import { useState } from "react";
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
if (view === "hydrate") {
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
