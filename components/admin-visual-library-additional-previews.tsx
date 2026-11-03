import { AdoptionCardMedia } from "@/components/adoption-card-media";
import { ArticlePromo } from "@/components/article-promo";
import { ImageDisplay } from "@/components/image-display";
import { PawMark, SearchIcon, MenuIcon, CloseIcon } from "@/components/icons";
import { PartnerPasswordField } from "@/components/partner-password-field";

/** Read-only owner review of existing public components with synthetic fixtures. */
export type AdminAdditionalPreviewId =
  | "adoption-card-media"
  | "article-promo"
  | "image-display"
  | "icons"
  | "partner-password-field";

export function AdminAdditionalComponentPreview({id}: {id: AdminAdditionalPreviewId}) {
  switch(id) {
    case "adoption-card-media":
      return <div style={{maxWidth:340,padding:10}}>
        <AdoptionCardMedia href="/pomoc-psom/adopcia" name="Ukážkový pes"
          status="ACTIVE" mainImage={null}/>
      </div>;
    case "article-promo":
      return <div style={{padding:10}}>
        <ArticlePromo promoKey="veterinari" variant="v1" seed="admin-catalog"
          compact anchorId="admin-only-promo-example"/>
      </div>;
    case "image-display":
      return <div style={{maxWidth:390,padding:12}}>
        <ImageDisplay src="/images/hero-labrador.webp" alt="Ukážka obrázka"
          context="thumbnail" fallbackOnError />
      </div>;
    case "icons":
      return <div style={{display:"flex",gap:20,padding:20,alignItems:"center"}}>
        <PawMark size={32}/><SearchIcon size={28}/><MenuIcon size={28}/><CloseIcon size={28}/>
      </div>;
    case "partner-password-field":
      return <div style={{maxWidth:450,padding:12}}>
        <PartnerPasswordField label="Ukážka hesla" value=""
          onChange={() => { /* inert visual-only preview */ }}
          autoComplete="new-password" hint="Ukážkové pole, neprihlasuje sa."/>
      </div>;
  }
}
