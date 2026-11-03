import { ArticleContinuation } from "@/components/article-continuation";
import { EventMarkdown } from "@/components/event-markdown";
import { HelpCategoryIcon } from "@/components/help-public-icons";
import { PortalMobileCategorySelect } from "@/components/portal-mobile-category-select";
import { PublicHelpCardSurface } from "@/components/public-visual-system/public-help-card-surface";
import { PublicPhotoGallery } from "@/components/public-visual-system/public-photo-gallery";
import { ShareButton } from "@/components/share-button";
import { SmartCardImage } from "@/components/smart-card-image";
import { SlovakiaLocationSelector } from "@/components/slovakia-location-selector";

/** Genuine, owner-visible public controls with synthetic data and no submitted changes. */
export type AdminUtilityPreviewId =
  | "article-continuation"
  | "event-markdown"
  | "help-public-icons"
  | "portal-mobile-category-select"
  | "public-help-card-surface"
  | "public-photo-gallery"
  | "share-button"
  | "smart-card-image"
  | "slovakia-location-selector";

export function AdminUtilityComponentPreview({ id }: { id: AdminUtilityPreviewId }) {
  switch (id) {
    case "article-continuation":
      return <ArticleContinuation next={{href:"/steniatka",label:"Ďalšie články o šteniatkach",context:"topic"}} />;
    case "event-markdown":
      return <div style={{padding:12,maxWidth:550}}>
        <EventMarkdown value={"## Ukážkový program\n\nPrednáška, ukážka poslušnosti a spoločné otázky."} />
      </div>;
    case "help-public-icons":
      return <div style={{display:"flex",gap:16,alignItems:"center",padding:18}}>
        <HelpCategoryIcon category="adopcia" size={32} />
        <HelpCategoryIcon category="utulky" size={32} />
        <HelpCategoryIcon category="stratene-a-najdene" size={32} />
        <span>Ikony kategórií Pomoc psom</span>
      </div>;
    case "portal-mobile-category-select":
      return <div style={{padding:16}}>
        <PortalMobileCategorySelect sectionLabel="Šteniatka" items={[
          {href:"/steniatka",label:"Prehľad"},
          {href:"/steniatka/prve-dni",label:"Prvé dni",current:true},
        ]} />
      </div>;
    case "public-help-card-surface":
      return <div style={{maxWidth:400,padding:12}}>
        <PublicHelpCardSurface>
          <div style={{padding:20}}>
            <strong>Spoločný obal karty Pomoc psom</strong>
            <p>Ilustračný obsah bez reálneho prípadu.</p>
          </div>
        </PublicHelpCardSurface>
      </div>;
    case "public-photo-gallery":
      return <div style={{padding:12,maxWidth:520}}>
        <PublicPhotoGallery variant="editorial" images={[
          {src:"/images/hero-labrador.webp",alt:"Ilustračná fotografia psa",caption:"Ukážkový popis"},
          {src:"/images/zdravie-veterinar.webp",alt:"Ilustračná fotografia",caption:"Druhá fotografia"},
        ]} />
      </div>;
    case "share-button":
      return <div style={{padding:18}}>
        <ShareButton title="Ilustračný článok" url="https://psipedia.sk/clanky" />
      </div>;
    case "smart-card-image":
      return <div style={{padding:12,maxWidth:360}}>
        <SmartCardImage src="/images/hero-labrador.webp" alt="Ilustračná fotografia psa"
          style={{width:"100%",height:190,objectFit:"cover",borderRadius:12}} />
      </div>;
    case "slovakia-location-selector":
      return <div style={{padding:12,maxWidth:520}}>
        <SlovakiaLocationSelector value={{region:"",district:"",city:""}}
          onChange={() => { /* inert owner preview; do not submit profile changes */ }}
          idPrefix="admin-visual-library-location" />
      </div>;
  }
}
