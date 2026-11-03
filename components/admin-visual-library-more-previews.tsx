import Link from "next/link";
import { BreedFciDisclosure } from "@/components/breed-fci-disclosure";
import { BreedPhoto } from "@/components/breed-photo";
import { DirectoryOpeningHours } from "@/components/directory-opening-hours";
import { DogAgeCalculator } from "@/components/dog-age-calculator";
import { EventImage } from "@/components/event-image";
import { EventsBackLink } from "@/components/events-return-link";
import { HelpReportGuide } from "@/components/help-report-guide";
import { HorizontalCarouselControls } from "@/components/horizontal-carousel-controls";
import { PublicFilterDisclosure } from "@/components/public-filter-disclosure";
import { PublicProfileHero } from "@/components/public-profile/public-profile-hero";
import { RelatedEntityLinks } from "@/components/related-entity-links";

/** More actual public components, isolated with synthetic content and inert gallery controls. */
export type AdminMorePreviewId =
  | "breed-fci-disclosure"
  | "breed-photo-fallback"
  | "directory-opening-hours"
  | "dog-age-calculator"
  | "event-image-fallback"
  | "events-back-link"
  | "help-report-guide"
  | "horizontal-carousel-controls"
  | "public-filter-disclosure"
  | "public-profile-hero"
  | "related-entity-links";

export function AdminMoreComponentPreview({ id }: { id: AdminMorePreviewId }) {
  switch (id) {
    case "breed-fci-disclosure":
      return <div style={{padding:16}}><BreedFciDisclosure>
        <p>Ilustračný obsah štandardu plemena. Žiadne produkčné údaje.</p>
      </BreedFciDisclosure></div>;
    case "breed-photo-fallback":
      return <div style={{maxWidth:320,padding:10}}>
        <BreedPhoto alt="Ukážka náhrady za fotografiu plemena"
          className="breed-detail-image" style={{width:"100%",minHeight:160}} />
      </div>;
    case "directory-opening-hours":
      return <div style={{padding:12,maxWidth:500}}>
        <DirectoryOpeningHours value="Po–Pi: 08:00–17:00, So: 09:00–12:00" />
      </div>;
    case "dog-age-calculator":
      return <div style={{padding:12,maxWidth:530}}><DogAgeCalculator /></div>;
    case "event-image-fallback":
      return <div style={{padding:10,maxWidth:480}}>
        <EventImage imageUrl={null} eventType="Výstava"
          alt="Ilustračná fotografia k ukážkovému podujatiu"
          style={{width:"100%",height:"auto",borderRadius:12}} />
      </div>;
    case "events-back-link":
      return <div style={{padding:18}}>
        <EventsBackLink fallbackHref="/podujatia" />
      </div>;
    case "help-report-guide":
      return <div style={{maxHeight:500,overflow:"hidden",pointerEvents:"none"}}>
        <HelpReportGuide />
      </div>;
    case "horizontal-carousel-controls":
      return <div style={{padding:12}}>
        <div id="admin-only-carousel-visual-sample" style={{display:"flex",gap:8,overflow:"hidden",marginBottom:10}}>
          <span style={{padding:14,background:"#f5f7ef"}}>Ukážka A</span>
          <span style={{padding:14,background:"#f5f7ef"}}>Ukážka B</span>
          <span style={{padding:14,background:"#f5f7ef"}}>Ukážka C</span>
        </div>
        <HorizontalCarouselControls targetId="admin-only-carousel-visual-sample" />
      </div>;
    case "public-filter-disclosure":
      return <div style={{padding:16}}>
        <PublicFilterDisclosure activeCount={2} label="Ďalšie filtre">
          <p>Ilustračný obsah rozbaľovacieho filtra.</p>
        </PublicFilterDisclosure>
      </div>;
    case "public-profile-hero":
      return <div style={{padding:8}}>
        <PublicProfileHero
          breadcrumbs={<><Link href="/">Domov</Link><span> / </span><span>Ukážkový profil</span></>}
          typeLabel="Služby pre psov"
          title="Ukážkové veterinárne pracovisko"
          lead="Ilustračná hlavička detailu profilu. Nezobrazuje reálnu prevádzku."
          location="Nitra"
          imageUrl={null}
          actions={[{href:"/adresar",label:"Zobraziť adresár",primary:true}]}
        />
      </div>;
    case "related-entity-links":
      return <div style={{padding:12,maxWidth:540}}>
        <RelatedEntityLinks label="Ukážka súvisiacich odkazov" links={[
          {href:"/plemena",label:"Atlas plemien",description:"Prehľad všetkých plemien"},
          {href:"/adresar",label:"Služby pre psov",description:"Vyhľadávanie odborníkov"},
        ]} />
      </div>;
  }
}
