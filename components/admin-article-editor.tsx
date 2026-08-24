"use client";

import Link from "next/link";
import { ChangeEvent, useState } from "react";
import { AdminArticleBlockEditor } from "@/components/admin-article-block-editor";
import { ArticleBlocks } from "@/components/article-blocks";
import type { ManagedArticle } from "@/lib/article-store";
import { createArticleBlock, legacyArticleBlocks, type ArticleBlock } from "@/lib/article-blocks";
import {
  articlePortalSectionOptions,
  getPortalSection,
  portalSectionLabel,
  type ArticlePortalSection,
} from "@/lib/portal";
import { getNewsCategory, newsCategories, type NewsCategorySlug } from "@/lib/news";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

const puppyAreas = getPortalSection("steniatka")?.subpages.filter((subpage) => !subpage.href) ?? [];

export function AdminArticleEditor({
  article,
  defaultPortalSection = "steniatka",
  defaultPortalSubpage,
}: {
  article?: ManagedArticle;
  defaultPortalSection?: ArticlePortalSection;
  defaultPortalSubpage?: string;
}) {
  const [title, setTitle] = useState(article?.title ?? "");
  const [slug, setSlug] = useState(article?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(article));
  const [category, setCategory] = useState(article?.category ?? "Výcvik");
  const [portalSection, setPortalSection] = useState<ArticlePortalSection>(article?.portalSection ?? defaultPortalSection);
  const [portalSubpage, setPortalSubpage] = useState(
    article?.portalSubpage ??
    puppyAreas.find((area) => area.slug === defaultPortalSubpage)?.slug ??
    puppyAreas[0]?.slug ?? "",
  );
  const [newsCategory, setNewsCategory] = useState<NewsCategorySlug>(article?.newsCategory ?? "zo-sveta");
  const [accent, setAccent] = useState(article?.accent ?? "forest");
  const [author, setAuthor] = useState(article?.author ?? "Redakcia Psipedia");
  const [readingMinutes, setReadingMinutes] = useState(article?.readingMinutes ?? 5);
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? "");
  const [intro, setIntro] = useState(article?.intro ?? "");
  const [takeaway, setTakeaway] = useState(article?.takeaway ?? "");
  const [imageUrl, setImageUrl] = useState(article?.image ?? "");
  const [imageKey, setImageKey] = useState(article?.imageKey ?? "");
  const [blocks, setBlocks] = useState<ArticleBlock[]>(
    article?.blocks?.length
      ? article.blocks
      : article
        ? legacyArticleBlocks(article.sections, article.sources)
        : [createArticleBlock("text")],
  );
  const [status, setStatus] = useState(article?.status ?? "draft");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(true);

  function changeTitle(value: string) {
    setTitle(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  function changePortalSection(value: ArticlePortalSection) {
    setPortalSection(value);
    if (value === "steniatka" && !puppyAreas.some((area) => area.slug === portalSubpage)) {
      setPortalSubpage(puppyAreas[0]?.slug ?? "");
    }
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
      setMessage(adminImageUploadMessage(data, "Ulož článok, aby sa zmena zachovala."));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Obrázok sa nepodarilo nahrať.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function save(nextStatus: "draft" | "published") {
    setSaving(true);
    setError("");
    setMessage("");

    const payload = {
      title,
      slug,
      category,
      portalSection,
      portalSubpage: portalSection === "steniatka" ? portalSubpage : null,
      newsCategory: portalSection === "novinky" ? newsCategory : null,
      accent,
      author,
      readingMinutes,
      excerpt,
      intro,
      takeaway,
      imageUrl: imageUrl || null,
      imageKey: imageKey || null,
      status: nextStatus,
      blocks,
      sections: [],
      sources: [],
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
      setMessage(nextStatus === "published" ? (portalSection === "novinky" ? "Novinka je publikovaná na webe." : "Článok je publikovaný na webe.") : "Koncept je bezpečne uložený.");
      if (!article) {
        window.location.assign(`/admin/clanky/${data.article.id}?vytvoreny=1`);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Článok sa nepodarilo uložiť.");
    } finally {
      setSaving(false);
    }
  }

  function unpublish() {
    if (window.confirm("Stiahnuť tento článok z verejného webu a ponechať ho ako koncept?")) {
      void save("draft");
    }
  }

  return (
    <div className={`admin-editor ${previewOpen ? "has-preview" : ""}`}>
      <form className="admin-editor-form" onSubmit={(event) => { event.preventDefault(); void save("draft"); }}>
        <section className="admin-form-card admin-form-card--intro">
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
          <div className="admin-card-heading">
            <div><span>01</span><div><h2>Základné nastavenie</h2><p>Téma, autor a adresa článku.</p></div></div>
          </div>
          <div className="admin-field-grid">
            <div className="admin-field">
              <label htmlFor="article-portal-section">Sekcia portálu</label>
              <select id="article-portal-section" value={portalSection} onChange={(event) => changePortalSection(event.target.value as ArticlePortalSection)}>
                {articlePortalSectionOptions.map((option) => <option value={option.slug} key={option.slug}>{option.label}</option>)}
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
            {portalSection === "steniatka" && (
              <div className="admin-field">
                <label htmlFor="article-puppy-area">Oblasť Šteniatok</label>
                <select id="article-puppy-area" value={portalSubpage} onChange={(event) => setPortalSubpage(event.target.value)} required>
                  {puppyAreas.map((area) => <option value={area.slug} key={area.slug}>{area.label}</option>)}
                </select>
                <small>Článok sa zobrazí na samostatnej stránke vybranej oblasti.</small>
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
            <div className="admin-field">
              <label htmlFor="article-author">Autor</label>
              <input id="article-author" value={author} onChange={(event) => setAuthor(event.target.value)} />
            </div>
            <div className="admin-field">
              <label htmlFor="article-accent">Farebný akcent</label>
              <select id="article-accent" value={accent} onChange={(event) => setAccent(event.target.value as ManagedArticle["accent"])}>
                <option value="forest">Lesná zelená</option><option value="coral">Koralová</option><option value="gold">Zlatá</option><option value="blue">Modrá</option>
              </select>
            </div>
          </div>
          <div className="admin-field">
            <label htmlFor="article-slug">Adresa článku</label>
            <div className="admin-slug-input"><span>psipedia.sk/{portalSection === "clanky" ? "clanky" : portalSection}/</span><input id="article-slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.target.value)); }} placeholder="adresa-clanku" required /></div>
            <small>Výsledná adresa: psipedia.sk/{portalSection === "clanky" ? "clanky" : portalSection}/{slug || "adresa-clanku"}</small>
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-card-heading">
            <div><span>02</span><div><h2>Titulná fotografia</h2><p>JPG, PNG, WebP alebo AVIF, najviac 8 MB.</p></div></div>
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
              {imageUrl && <button type="button" onClick={() => { setImageUrl(""); setImageKey(""); }}>Odstrániť fotku</button>}
              <small>Odporúčaný pomer 16 : 9 a šírka aspoň 1200 px.</small>
            </div>
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-card-heading">
            <div><span>03</span><div><h2>Úvod a hlavná myšlienka</h2><p>Pomôžu čitateľovi rýchlo sa zorientovať.</p></div></div>
          </div>
          <div className="admin-field">
            <label htmlFor="article-intro">Úvod článku</label>
            <textarea id="article-intro" rows={5} value={intro} onChange={(event) => setIntro(event.target.value)} placeholder="Uveď čitateľa do témy…" required />
          </div>
          <div className="admin-field">
            <label htmlFor="article-takeaway">To najdôležitejšie</label>
            <textarea id="article-takeaway" rows={3} value={takeaway} onChange={(event) => setTakeaway(event.target.value)} placeholder="Jedna jasná myšlienka, ktorú si má čitateľ odniesť." required />
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-card-heading">
            <div><span>04</span><div><h2>Blokový obsah článku</h2><p>Pridávaj text, nadpisy, obrázky, zoznamy, zdroje a ďalšie prvky v ľubovoľnom poradí.</p></div></div>
          </div>
          {portalSection === "novinky" && <p className="admin-block-news-note">Pri publikovaní novinky pridaj aspoň jeden blok <strong>Odborný zdroj</strong>.</p>}
          <AdminArticleBlockEditor
            blocks={blocks}
            onChange={setBlocks}
            currentArticleId={article?.id}
            onUploadingChange={setUploading}
            onMessage={setMessage}
            onError={setError}
          />
        </section>

        {(message || error) && <div className={`admin-editor-message ${error ? "is-error" : "is-success"}`} role="status">{error || message}</div>}

        <div className="admin-editor-actions">
          <div>
            <Link href="/admin">← Späť na články</Link>
            <button className="admin-preview-toggle" type="button" onClick={() => setPreviewOpen((value) => !value)}>{previewOpen ? "Skryť náhľad" : "Ukázať náhľad"}</button>
          </div>
          <div>
            {status === "published" && <button className="admin-unpublish" type="button" disabled={saving || uploading} onClick={unpublish}>Stiahnuť z webu</button>}
            <button className="admin-save-draft" type="submit" disabled={saving || uploading}>{saving ? "Ukladám…" : "Uložiť koncept"}</button>
            <button className="admin-publish" type="button" disabled={saving || uploading} onClick={() => void save("published")}>{saving ? "Ukladám…" : status === "published" ? "Uložiť a aktualizovať" : `Publikovať ${portalSection === "novinky" ? "novinku" : "článok"}`}</button>
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
            <p className="admin-preview-intro">{intro || "Úvod článku sa zobrazí na tomto mieste."}</p>
            <div className="admin-preview-takeaway"><strong>To najdôležitejšie</strong><p>{takeaway || "Hlavná myšlienka článku."}</p></div>
            <ArticleBlocks blocks={blocks} preview />
          </article>
        </aside>
      )}
    </div>
  );
}
