"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { AdminArticleBlockEditor, RichTextInput } from "@/components/admin-article-block-editor";
import { AdminEditorialAuthorField } from "@/components/admin-editorial-author-field";
import { AdminActionButton, AdminHelpText, AdminStickyEditorNavigation } from "@/components/admin-interaction-system";
import { ArticleBlocks } from "@/components/article-blocks";
import { EditorialRichText } from "@/components/editorial-rich-text";
import type { ArticleStatus, ManagedArticle } from "@/lib/article-store";
import type { ManagedBreedSummary } from "@/lib/breed-store";
import { createArticleBlock, legacyArticleBlocks, type ArticleBlock } from "@/lib/article-blocks";
import {
  articlePortalSectionOptions,
  portalSections as defaultPortalSections,
  portalSectionLabel,
  type ArticlePortalSection,
  type PortalSection,
} from "@/lib/portal";
import { getNewsCategory, newsCategories, type NewsCategorySlug } from "@/lib/news";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import { legacyRichTextToDocument } from "@/lib/editorial-content";

function slugify(value: string, maxLength = 90) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}

function dateTimeValue(value?: string | null) {
  return value ? value.slice(0, 16) : "";
}

const editorNavigation = [
  { id: "article-basics", label: "Základné údaje" },
  { id: "article-publish", label: "Publikovanie" },
  { id: "article-seo", label: "SEO" },
  { id: "article-settings", label: "Zaradenie" },
  { id: "article-authors", label: "Autor" },
  { id: "article-media", label: "Médiá" },
  { id: "article-content", label: "Obsah" },
];

export function AdminArticleEditor({
  article,
  defaultPortalSection = "steniatka",
  defaultPortalSubpage,
  breedOptions = [],
  managedSections = defaultPortalSections,
}: {
  article?: ManagedArticle;
  defaultPortalSection?: ArticlePortalSection;
  defaultPortalSubpage?: string;
  breedOptions?: ManagedBreedSummary[];
  managedSections?: Array<PortalSection & { visible?: boolean }>;
}) {
  const initialPortalSection = article?.portalSection ?? defaultPortalSection;
  const sectionOptions = [
    articlePortalSectionOptions[0],
    ...managedSections
      .filter((section) => section.articleEnabled && section.visible !== false)
      .map((section) => ({ slug: section.slug as ArticlePortalSection, label: section.label })),
  ];
  const areasFor = (sectionSlug: ArticlePortalSection) =>
    managedSections.find((section) => section.slug === sectionSlug)?.subpages.filter((subpage) => !subpage.href && subpage.visible !== false) ?? [];
  const initialAreas = areasFor(initialPortalSection);
  const [title, setTitle] = useState(article?.title ?? "");
  const [slug, setSlug] = useState(article?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(article));
  const [category, setCategory] = useState(article?.category ?? "Výcvik");
  const [portalSection, setPortalSection] = useState<ArticlePortalSection>(initialPortalSection);
  const [portalSubpage, setPortalSubpage] = useState(
    article?.portalSubpage ??
    initialAreas.find((area) => area.slug === defaultPortalSubpage)?.slug ??
    initialAreas[0]?.slug ?? "",
  );
  const currentAreas = areasFor(portalSection);
  const [newsCategory, setNewsCategory] = useState<NewsCategorySlug>(article?.newsCategory ?? "zo-sveta");
  const [accent, setAccent] = useState(article?.accent ?? "forest");
  const [author, setAuthor] = useState(article?.author ?? "Redakcia Psipedia");
  const [authorProfileId, setAuthorProfileId] = useState<number | null | undefined>(article ? article.authorProfileId : undefined);
  const [readingMinutes, setReadingMinutes] = useState(article?.readingMinutes ?? 5);
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? "");
  const [intro, setIntro] = useState(article?.intro ?? "");
  const [introRichText, setIntroRichText] = useState(article?.introRichText ?? legacyRichTextToDocument(article?.intro ?? ""));
  const [takeaway, setTakeaway] = useState(article?.takeaway ?? "");
  const [takeawayRichText, setTakeawayRichText] = useState(article?.takeawayRichText ?? legacyRichTextToDocument(article?.takeaway ?? ""));
  const [imageUrl, setImageUrl] = useState(article?.image ?? "");
  const [imageKey, setImageKey] = useState(article?.imageKey ?? "");
  const [publishedAt, setPublishedAt] = useState(dateTimeValue(article?.publishedAt));
  const [contentUpdatedAt, setContentUpdatedAt] = useState(article?.contentUpdatedAt?.slice(0, 10) ?? "");
  const [showUpdated, setShowUpdated] = useState(article?.showUpdated ?? false);
  const [seoTitle, setSeoTitle] = useState(article?.seo?.title ?? "");
  const [metaDescription, setMetaDescription] = useState(article?.seo?.description ?? "");
  const [canonicalUrl, setCanonicalUrl] = useState(article?.seo?.canonicalUrl ?? "");
  const [noindex, setNoindex] = useState(article?.seo?.noindex ?? false);
  const [focusKeyword, setFocusKeyword] = useState(article?.seo?.focusKeyword ?? "");
  const [ogTitle, setOgTitle] = useState(article?.seo?.ogTitle ?? "");
  const [ogDescription, setOgDescription] = useState(article?.seo?.ogDescription ?? "");
  const [ogImageUrl, setOgImageUrl] = useState(article?.seo?.ogImage ?? "");
  const [ogImageKey, setOgImageKey] = useState(article?.ogImageKey ?? "");
  const [blocks, setBlocks] = useState<ArticleBlock[]>(
    article?.blocks?.length
      ? article.blocks
      : article
        ? legacyArticleBlocks(article.sections, article.sources)
        : [createArticleBlock("text", "new-article-initial-text")],
  );
  const [status, setStatus] = useState(article?.status ?? "draft");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(true);
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const allowNavigationRef = useRef(false);
  const [relatedBreedIds,setRelatedBreedIds]=useState(article?.relatedBreedIds??[]);

  function setEditorDirty(value: boolean) {
    dirtyRef.current = value;
    setDirtyState(value);
  }

  function changeTitle(value: string) {
    setTitle(value);
    if (!slugEdited) setSlug(slugify(value, 60));
  }

  function changePortalSection(value: ArticlePortalSection) {
    setPortalSection(value);
    const nextAreas = areasFor(value);
    if (!nextAreas.some((area) => area.slug === portalSubpage)) setPortalSubpage(nextAreas[0]?.slug ?? "");
    if (value === "novinky" && category === "Výcvik") setCategory("Život so psom");
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const data = await uploadAdminImage(file, "articles");
      setImageUrl(data.imageUrl);
      setImageKey(data.imageKey);
      setEditorDirty(true);
      setMessage(adminImageUploadMessage(data, "Ulož článok, aby sa zmena zachovala."));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Obrázok sa nepodarilo nahrať.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function uploadOgImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(""); setMessage("");
    try {
      const data = await uploadAdminImage(file, "articles");
      setOgImageUrl(data.imageUrl); setOgImageKey(data.imageKey); setEditorDirty(true);
      setMessage(adminImageUploadMessage(data, "Ulož článok, aby sa Open Graph obrázok zachoval."));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Open Graph obrázok sa nepodarilo nahrať.");
    } finally {
      setUploading(false); event.target.value = "";
    }
  }

  async function save(nextStatus: ArticleStatus) {
    setSaving(true);
    setError("");
    setMessage("");

    const requestedPublishedAt = publishedAt ? new Date(publishedAt) : null;
    const effectivePublishedAt = nextStatus === "published" && requestedPublishedAt && requestedPublishedAt.getTime() > Date.now()
      ? new Date()
      : requestedPublishedAt;
    const payload = {
      title,
      slug,
      category,
      portalSection,
      portalSubpage: currentAreas.length ? portalSubpage : null,
      newsCategory: portalSection === "novinky" ? newsCategory : null,
      accent,
      author,
      authorProfileId: article && authorProfileId === article.authorProfileId && author === article.author ? undefined : authorProfileId,
      readingMinutes,
      excerpt,
      intro,
      introRichText,
      takeaway,
      takeawayRichText,
      imageUrl: imageUrl || null,
      imageKey: imageKey || null,
      status: nextStatus,
      blocks,
      sections: [],
      sources: [],
      publishedAt: effectivePublishedAt?.toISOString() ?? null,
      contentUpdatedAt: contentUpdatedAt ? new Date(`${contentUpdatedAt}T12:00:00`).toISOString() : null,
      showUpdated,
      seoTitle,
      metaDescription,
      canonicalUrl,
      noindex,
      focusKeyword,
      ogTitle,
      ogDescription,
      ogImageUrl: ogImageUrl || null,
      ogImageKey: ogImageKey || null,
      relatedBreedIds,
    };

    try {
      const endpoint = article ? `/api/admin/articles/${article.id}` : "/api/admin/articles";
      const response = await fetch(endpoint, {
        method: article ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { article?: ManagedArticle; error?: string };
      if (!response.ok || !data.article) throw new Error(data.error || "Článok sa nepodarilo uložiť.");

      setStatus(data.article.status);
      setPublishedAt(dateTimeValue(data.article.publishedAt));
      setEditorDirty(false);
      setMessage(nextStatus === "published" ? (portalSection === "novinky" ? "Novinka je publikovaná na webe." : "Článok je publikovaný na webe.") : nextStatus === "scheduled" ? "Publikovanie je naplánované." : "Koncept je bezpečne uložený.");
      if (!article) {
        allowNavigationRef.current = true;
        window.location.assign(`/admin/clanky/${data.article.id}?vytvoreny=1`);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Článok sa nepodarilo uložiť.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current || allowNavigationRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  function cancelEditing() {
    if (dirty && !window.confirm("Máš neuložené zmeny. Naozaj chceš opustiť editor bez uloženia?")) return;
    allowNavigationRef.current = true;
    window.location.assign("/admin");
  }

  function unpublish() {
    if (window.confirm("Stiahnuť tento článok z verejného webu a ponechať ho ako koncept?")) {
      void save("draft");
    }
  }

  return (
    <div className={`admin-editor ${previewOpen ? "has-preview" : ""}`}>
      <form className="admin-editor-form" onChange={(event) => { if (!(event.target as HTMLElement).closest("dialog")) setEditorDirty(true); }} onInput={(event) => { if (!(event.target as HTMLElement).closest("dialog")) setEditorDirty(true); }} onSubmit={(event) => { event.preventDefault(); void save("draft"); }}>
        <AdminStickyEditorNavigation sections={editorNavigation} ariaLabel="Sekcie editora článku" />
        <section id="article-basics" tabIndex={-1} className="admin-form-card admin-form-card--intro">
          <div className="admin-field admin-field--title">
            <label htmlFor="article-title">Názov {portalSection === "novinky" ? "novinky" : "článku"}</label>
            <input id="article-title" value={title} onChange={(event) => changeTitle(event.target.value)} placeholder="Napríklad: Ako naučiť psa pokojne čakať" required />
          </div>
          <div className="admin-field">
            <label htmlFor="article-excerpt">Krátky úvod na karte</label>
            <textarea id="article-excerpt" rows={3} value={excerpt} onChange={(event) => setExcerpt(event.target.value)} placeholder="Jednou až dvomi vetami vysvetli, čo čitateľ v článku nájde." required />
            <small>{excerpt.length} znakov · odporúčame 90–180</small>
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-card-heading"><div><span>03B</span><div><h2>Prepojenie na plemená</h2><p>Článok sa zobrazí v časti „Prehĺbte si vedomosti“ iba pri vybraných plemenách.</p></div></div></div>
          <div className="admin-breed-article-links">{breedOptions.map((item)=><label className="admin-check" key={item.id}><input type="checkbox" checked={relatedBreedIds.includes(item.id)} onChange={()=>setRelatedBreedIds((current)=>current.includes(item.id)?current.filter((id)=>id!==item.id):[...current,item.id])}/><span>{item.name}{item.fciNumber?` · FCI ${item.fciNumber}`:""}</span></label>)}</div>
        </section>

        <section id="article-publish" tabIndex={-1} className="admin-form-card">
          <div className="admin-card-heading"><div><span>01</span><div><h2>Publikovanie</h2><p>Termín publikovania a redakčná aktualizácia.</p></div></div></div>
          <div className="admin-field-grid">
            <div className="admin-field"><label htmlFor="article-published-at">Dátum a čas publikovania</label><input id="article-published-at" type="datetime-local" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} /><small>Pri okamžitom publikovaní môže zostať prázdny.</small></div>
            <div className="admin-field"><label htmlFor="article-updated-at">Dátum aktualizácie</label><input id="article-updated-at" type="date" value={contentUpdatedAt} onChange={(event) => setContentUpdatedAt(event.target.value)} /></div>
          </div>
          <label className="admin-check"><input type="checkbox" checked={showUpdated} onChange={(event) => setShowUpdated(event.target.checked)} /><span><strong>Zobraziť označenie Aktualizované</strong><small>Pri titulku sa zobrazí zvolený dátum aktualizácie.</small></span></label>
        </section>

        <section id="article-seo" tabIndex={-1} className="admin-form-card">
          <div className="admin-card-heading"><div><span>02</span><div><h2>SEO a zdieľanie</h2><p>Ak pole necháš prázdne, použije sa názov, perex alebo titulná fotografia článku.</p></div></div></div>
          <div className="admin-field-grid">
            <div className="admin-field"><label htmlFor="article-seo-title">SEO title</label><input id="article-seo-title" value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} placeholder={title || "Názov pre vyhľadávače"} /><small>{seoTitle.length} znakov · odporúčame do 60</small></div>
            <div className="admin-field"><label htmlFor="article-focus-keyword">Hlavné kľúčové slovo alebo fráza</label><input id="article-focus-keyword" value={focusKeyword} onChange={(event) => setFocusKeyword(event.target.value)} placeholder="napríklad výživa labradora" /></div>
            <div className="admin-field admin-field--full"><label htmlFor="article-meta-description">Meta description</label><textarea id="article-meta-description" rows={3} value={metaDescription} onChange={(event) => setMetaDescription(event.target.value)} placeholder={excerpt || "Krátky popis pre výsledky vyhľadávania"} /><small>{metaDescription.length} znakov · odporúčame 120–160</small></div>
            <div className="admin-field admin-field--full"><label htmlFor="article-canonical-url">Canonical URL</label><input id="article-canonical-url" type="url" value={canonicalUrl} onChange={(event) => setCanonicalUrl(event.target.value)} placeholder={`https://psipedia.sk/${portalSection === "clanky" ? "clanky" : portalSection}/${slug || "adresa-clanku"}`} /></div>
            <div className="admin-field"><label htmlFor="article-og-title">Open Graph titulok</label><input id="article-og-title" value={ogTitle} onChange={(event) => setOgTitle(event.target.value)} placeholder={seoTitle || title || "Titulok pri zdieľaní"} /></div>
            <div className="admin-field"><label htmlFor="article-og-description">Open Graph popis</label><textarea id="article-og-description" rows={3} value={ogDescription} onChange={(event) => setOgDescription(event.target.value)} placeholder={metaDescription || excerpt || "Popis pri zdieľaní"} /></div>
          </div>
          <div className="admin-upload-row admin-og-upload">
            <div className={`admin-upload-preview admin-upload-preview--${accent}`}>{ogImageUrl ? <img src={ogImageUrl} alt="Náhľad Open Graph obrázka" /> : <span>OG</span>}</div>
            <div className="admin-upload-actions"><strong>Open Graph obrázok</strong><label className="admin-upload-button"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={uploadOgImage} disabled={uploading} />{ogImageUrl ? "Vybrať iný obrázok" : "Nahrať obrázok"}</label>{ogImageUrl && <button type="button" onClick={() => { setOgImageUrl(""); setOgImageKey(""); setEditorDirty(true); }}>Odstrániť obrázok</button>}<small>Odporúčaný pomer 1,91 : 1, napríklad 1200 × 630 px.</small></div>
          </div>
          <label className="admin-check"><input type="checkbox" checked={noindex} onChange={(event) => setNoindex(event.target.checked)} /><span><strong>Neindexovať článok (noindex)</strong><small>Článok zostane dostupný cez URL, ale vyhľadávače ho nemajú zaradiť.</small></span></label>
        </section>

        <section id="article-settings" tabIndex={-1} className="admin-form-card">
          <div className="admin-card-heading">
            <div><span>03</span><div><h2>Zaradenie a adresa</h2><p>Téma, sekcia a adresa článku.</p></div></div>
          </div>
          <div className="admin-field-grid">
            <div className="admin-field">
              <label htmlFor="article-portal-section">Sekcia portálu</label>
              <select id="article-portal-section" value={portalSection} onChange={(event) => changePortalSection(event.target.value as ArticlePortalSection)}>
                {sectionOptions.map((option) => <option value={option.slug} key={option.slug}>{option.label}</option>)}
              </select>
              <small>Určí, kde sa článok zobrazí a akú bude mať adresu.</small>
            </div>
            {portalSection !== "novinky" && (
              <div className="admin-field">
                <label htmlFor="article-category">Téma</label>
                <select id="article-category" value={category} onChange={(event) => setCategory(event.target.value as ManagedArticle["category"])}>
                  <option>Výcvik</option><option>Zdravie</option><option>Výživa</option><option>Život so psom</option>
                </select>
              </div>
            )}
            {portalSection !== "novinky" && portalSection !== "clanky" && currentAreas.length > 0 && (
              <div className="admin-field">
                <label htmlFor="article-portal-area">Oblasť {managedSections.find((section) => section.slug === portalSection)?.label ?? "sekcie"}</label>
                <select id="article-portal-area" value={portalSubpage} onChange={(event) => setPortalSubpage(event.target.value)} required>
                  {currentAreas.map((area) => <option value={area.slug} key={area.slug}>{area.label}</option>)}
                </select>
                <small>Článok sa zobrazí v zvolenej oblasti tejto sekcie.</small>
              </div>
            )}
            {portalSection === "novinky" && (
              <div className="admin-field">
                <label htmlFor="article-news-category">Typ novinky</label>
                <select id="article-news-category" value={newsCategory} onChange={(event) => setNewsCategory(event.target.value as NewsCategorySlug)}>
                  {newsCategories.map((option) => <option value={option.slug} key={option.slug}>{option.label}</option>)}
                </select>
                <small>Určí tematický prehľad, v ktorom sa novinka zobrazí.</small>
              </div>
            )}
            <div className="admin-field">
              <label htmlFor="article-reading">Čas čítania (minúty)</label>
              <input id="article-reading" type="number" min="1" max="60" value={readingMinutes} onChange={(event) => setReadingMinutes(Number(event.target.value))} />
            </div>
            <details className="admin-field admin-optional-settings">
              <summary>Vizuálne nastavenia <small>nepovinné</small></summary>
              <label htmlFor="article-accent">Farebný akcent</label>
              <select id="article-accent" value={accent} onChange={(event) => setAccent(event.target.value as ManagedArticle["accent"])}>
                <option value="forest">Lesná zelená</option><option value="coral">Koralová</option><option value="gold">Zlatá</option><option value="blue">Modrá</option>
              </select>
              <AdminHelpText>Akcent je sekundárne vizuálne nastavenie a nie je povinný pre napísanie článku.</AdminHelpText>
            </details>
          </div>
          <div className="admin-field">
            <label htmlFor="article-slug">Adresa článku</label>
            <div className="admin-slug-input"><span>psipedia.sk/{portalSection === "clanky" ? "clanky" : portalSection}/</span><input id="article-slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.target.value)); }} placeholder="adresa-clanku" required /></div>
            <small>Výsledná adresa: psipedia.sk/{portalSection === "clanky" ? "clanky" : portalSection}/{slug || "adresa-clanku"}</small>
          </div>
        </section>

        <section id="article-authors" tabIndex={-1} className="admin-form-card">
          <div className="admin-card-heading">
            <div><span>03A</span><div><h2>Autor</h2><p>Vyber profil autora alebo zachovaj legacy meno pri staršom článku.</p></div></div>
          </div>
          <AdminEditorialAuthorField
            selectedProfileId={authorProfileId}
            legacyAuthor={author}
            onSelectionChange={(id, displayName, markDirty = true) => {
              setAuthorProfileId(id);
              if (displayName) setAuthor(displayName);
              if (markDirty) setEditorDirty(true);
            }}
            onLegacyAuthorChange={(value) => { setAuthor(value); setEditorDirty(true); }}
            onMessage={setMessage}
            onError={setError}
          />
        </section>

        <section id="article-media" tabIndex={-1} className="admin-form-card">
          <div className="admin-card-heading">
            <div><span>04</span><div><h2>Médiá</h2><p>JPG, PNG, WebP alebo AVIF, najviac 8 MB.</p></div></div>
          </div>
          <div className="admin-upload-row">
            <div className={`admin-upload-preview admin-upload-preview--${accent}`}>
              {imageUrl ? <img src={imageUrl} alt="Náhľad titulnej fotografie" /> : <span>🐕</span>}
            </div>
            <div className="admin-upload-actions">
              <label className="admin-upload-button">
                <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={uploadImage} disabled={uploading} />
                {uploading ? "Nahrávam…" : imageUrl ? "Vybrať inú fotku" : "Nahrať fotku"}
              </label>
              {imageUrl && <button type="button" onClick={() => { setImageUrl(""); setImageKey(""); setEditorDirty(true); }}>Odstrániť fotku</button>}
              <small>Odporúčaný pomer 16 : 9 a šírka aspoň 1200 px.</small>
            </div>
          </div>
        </section>

        <section id="article-content" tabIndex={-1} className="admin-form-card">
          <div className="admin-card-heading">
            <div><span>05</span><div><h2>Obsah</h2><p>Pomôžu čitateľovi rýchlo sa zorientovať.</p></div></div>
          </div>
          <div className="admin-field">
            <label htmlFor="article-intro">Úvod článku</label>
            <RichTextInput id="article-intro" rows={7} value={intro} richText={introRichText} onChange={(content, richText) => { setIntro(content); setIntroRichText(richText); setEditorDirty(true); }} placeholder="Uveď čitateľa do témy…" showLists required />
          </div>
          <div className="admin-field">
            <label htmlFor="article-takeaway">To najdôležitejšie <small>nepovinné</small></label>
            <RichTextInput id="article-takeaway" rows={4} value={takeaway} richText={takeawayRichText} onChange={(content, richText) => { setTakeaway(content); setTakeawayRichText(richText); setEditorDirty(true); }} placeholder="Jedna jasná myšlienka, ktorú si má čitateľ odniesť." showLists />
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-card-heading">
            <div><span>06</span><div><h2>Blokový obsah článku</h2><p>Pridávaj text, nadpisy, obrázky, zoznamy, zdroje a ďalšie prvky v ľubovoľnom poradí.</p></div></div>
          </div>
          {portalSection === "novinky" && <p className="admin-block-news-note">Pri publikovaní novinky pridaj aspoň jeden blok <strong>Zdroj</strong>.</p>}
          <p className="admin-block-news-note">Pre viac zdrojov pridaj viac blokov <strong>Zdroj</strong>. Na verejnom článku sa spoja do jedného prehľadného zoznamu.</p>
          <AdminArticleBlockEditor
            blocks={blocks}
            onChange={(nextBlocks) => { setBlocks(nextBlocks); setEditorDirty(true); }}
            currentArticleId={article?.id}
            onUploadingChange={setUploading}
            onMessage={setMessage}
            onError={setError}
          />
        </section>

        {(message || error) && <div className={`admin-editor-message ${error ? "is-error" : "is-success"}`} role="status">{error || message}</div>}

        <div className="admin-editor-actions" aria-label="Akcie článku">
          <div>
            <AdminActionButton variant="link" onClick={cancelEditing}>Zrušiť / späť na články</AdminActionButton>
            <AdminActionButton variant="neutral" onClick={() => setPreviewOpen((value) => !value)}>{previewOpen ? "Skryť náhľad" : "Ukázať náhľad"}</AdminActionButton>
            <span className="admin-editor-dirty-state" role="status">{dirty ? "Neuložené zmeny" : "Všetky zmeny uložené"}</span>
          </div>
          <div>
            {status === "published" && <AdminActionButton variant="destructive" disabled={saving || uploading} onClick={unpublish}>Stiahnuť z webu</AdminActionButton>}
            <AdminActionButton variant="secondary" type="submit" disabled={saving || uploading}>{saving ? "Ukladám…" : "Uložiť koncept"}</AdminActionButton>
            <AdminActionButton variant="secondary" disabled={saving || uploading || !publishedAt} onClick={() => void save("scheduled")}>{saving ? "Ukladám…" : "Naplánovať publikovanie"}</AdminActionButton>
            <AdminActionButton variant="primary" disabled={saving || uploading} onClick={() => void save("published")}>{saving ? "Ukladám…" : status === "published" ? "Uložiť a aktualizovať" : `Publikovať ${portalSection === "novinky" ? "novinku" : "článok"}`}</AdminActionButton>
          </div>
        </div>
      </form>

      {previewOpen && (
        <aside className="admin-live-preview" aria-label="Živý náhľad článku">
          <div className="admin-preview-bar"><span><i /> Živý náhľad</span><small>takto bude článok vyzerať</small></div>
          <article className="admin-preview-paper">
            <span className="eyebrow">{portalSectionLabel(portalSection)} · {portalSection === "novinky" ? getNewsCategory(newsCategory)?.shortLabel : category}</span>
            <h1>{title || "Názov tvojho článku"}</h1>
            <p className="admin-preview-excerpt">{excerpt || "Tu sa zobrazí krátky úvod z karty článku."}</p>
            {imageUrl && <img className="admin-preview-image" src={imageUrl} alt="" />}
            <EditorialRichText className="admin-preview-intro" document={intro.trim() ? introRichText : legacyRichTextToDocument("Úvod článku sa zobrazí na tomto mieste.")} />
            {takeaway.trim() && <div className="admin-preview-takeaway"><strong>To najdôležitejšie</strong><EditorialRichText document={takeawayRichText} /></div>}
            <ArticleBlocks blocks={blocks} preview />
          </article>
        </aside>
      )}
    </div>
  );
}
