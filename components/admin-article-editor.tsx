"use client";
import { AdminRecordLifecycleActions } from "@/components/admin-record-lifecycle-actions";
import { responsiveMediaSrcSet } from "@/lib/responsive-media";
import {AdminSingleImageUpload} from "@/components/admin-single-image-upload";
import { AdminFormFeedback } from "@/components/admin-form-feedback";
import {adminSelectedImage} from "@/lib/admin-selected-image";

import { ChangeEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Blocks, CalendarDays, Camera, CheckCircle2, ChevronDown, Clock3, Eye, PawPrint, Search, Settings2, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { AdminTiptapArticleScope } from "@/components/admin-tiptap-article-editor";
import dynamic from "next/dynamic";
import { AdminLexicalTextField } from "@/components/admin-lexical-text-field";
import { ArticleEditorCalendar } from "@/components/article-editor-calendar";
import { AdminArticleTopicPicker } from "@/components/admin-article-topic-picker";
import { preservedEditorArticleMetadata } from "@/components/admin-article-editor-preserve";
import { AdminEditorialAuthorField } from "@/components/admin-editorial-author-field";
import { AdminActionButton, AdminHelpText } from "@/components/admin-interaction-system";
import { EditorActionBar, EditorWorkspace } from "@/components/admin-editor-workspace";
import editorStyles from "./admin-content-editor-v3.module.css";
import type { ArticleStatus, ManagedArticle } from "@/lib/article-store";
import { effectiveArticleStatus, articleEffectiveStatusLabel } from "@/lib/article-effective-status";
import { formatArticleLocalDateTime } from "@/lib/article-schedule-time";
import {facebookScheduleInstant,facebookWallTime,type FacebookImagePost} from "@/lib/facebook-image-post";
import Link from "next/link";

import type { AdminArticleBreedOption } from "@/lib/breed-store";
import { createArticleBlock, legacyArticleBlocks, type ArticleBlock } from "@/lib/article-blocks";
import {
  articlePortalSectionOptions,
  portalSections as defaultPortalSections,
  portalSectionLabel,
  type ArticlePortalSection,
  type PortalSection,
} from "@/lib/portal";
import { getNewsCategory, newsCategories, type NewsCategorySlug } from "@/lib/news";
import { articleCategoryForPortalPlacement } from "@/lib/article-subsection-taxonomy";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import { ImageDisplay } from "@/components/image-display";
const ImageDisplayEditor = dynamic(() => import("@/components/image-display-editor").then(module => module.ImageDisplayEditor), { ssr: false });
const AdminArticleContinuousEditor = dynamic(() => import("@/components/admin-article-continuous-editor").then(module => module.AdminArticleContinuousEditor), { ssr: false });
const AdminArticleFullscreenPreview = dynamic(() => import("@/components/admin-article-fullscreen-preview").then(module => module.AdminArticleFullscreenPreview), { ssr: false });
import { legacyArticleThumbnail, legacyArticleDetail, type ImageDisplayConfig } from "@/lib/image-display";
import { legacyRichTextToDocument } from "@/lib/editorial-content";
import type { ArticleQaIssue } from "@/lib/article-content-qa";
import type { ArticleTopic } from "@/lib/article-topics";


type FollowupStatus = "synced" | "skipped" | "partial" | "failed" | "deferred";
type FollowupReceipt = { status: FollowupStatus; code?: string; fields?: string[] };
type ArticleSaveReceipt = {
  d1: { status: "saved"; updatedAt: string };
  assignments?: { status: "synced" };
  notion: Partial<Record<"publication" | "placement" | "seo" | "draft", FollowupReceipt>>;
  lifecycle?: FollowupReceipt;
  media?: FollowupReceipt;
};
type PendingFacebookSave = {
  articleId: number;
  expectedVersion: FacebookImagePost["version"] | undefined;
  payload: Record<string, unknown>;
};
const notionStepNames = {
  publication: "Publikovanie v Notione",
  placement: "Sekcia a prepojené plemená v Notione",
  seo: "SEO v Notione",
  draft: "Obsah konceptu v Notione",
} as const;
function followupLabel(receipt: FollowupReceipt) {
  if (receipt.status === "synced") return "Potvrdené";
  if (receipt.status === "skipped") return "Nevykonáva sa";
  if (receipt.status === "deferred") return "Čaká na predchádzajúci krok";
  if (receipt.status === "partial") return "Čiastočne dokončené";
  return "Nepodarilo sa";
}

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
  return formatArticleLocalDateTime(value);
}

const editorNavigation = [
  { id: "article-publish", label: "Publikovanie", icon: <CalendarDays size={17} aria-hidden="true" /> },
  { id: "article-authors", label: "Autor", icon: <UserRound size={17} aria-hidden="true" /> },
  { id: "article-settings", label: "Nastavenia", icon: <Settings2 size={17} aria-hidden="true" /> },
  { id: "article-seo", label: "SEO", icon: <Search size={17} aria-hidden="true" /> },
  { id: "article-relations", label: "Prepojené plemená", icon: <PawPrint size={17} aria-hidden="true" /> },
  { id: "article-media", label: "Fotografie", icon: <Camera size={17} aria-hidden="true" /> },
  { id: "article-blocks", label: "Editor článku", icon: <Blocks size={17} aria-hidden="true" /> },
];

export function AdminArticleEditor({
  article,
  defaultPortalSection = "steniatka",
  defaultPortalSubpage,
  breedOptions = [],
  managedSections = defaultPortalSections,
  topicOptions = [],
  promoUtcDay,
  returnToCalendar,
}: {
  article?: ManagedArticle;
  defaultPortalSection?: ArticlePortalSection;
  defaultPortalSubpage?: string;
  breedOptions?: AdminArticleBreedOption[];
  managedSections?: Array<PortalSection & { visible?: boolean }>;
  topicOptions?: ArticleTopic[];
  promoUtcDay?: string;
  returnToCalendar?: string;
}) {
  const router = useRouter();
  const initialPortalSection = article?.portalSection ?? defaultPortalSection;
  const builtInSectionOptions = articlePortalSectionOptions.filter(
    (option) => option.slug === "clanky" || option.slug === "novinky",
  );
  const sectionOptions = [
    ...builtInSectionOptions,
    ...managedSections
      .filter((section) => section.slug !== "novinky" && section.articleEnabled && section.visible !== false)
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
    "",
  );
  const currentAreas = areasFor(portalSection);
  // Keep an imported or legacy area selectable even if it is absent from current public options.
  const originalAreaHidden = article?.portalSection === portalSection
    && Boolean(article?.portalSubpage)
    && !currentAreas.some((area) => area.slug === article?.portalSubpage);
  const [newsCategory, setNewsCategory] = useState<NewsCategorySlug>(article?.newsCategory ?? "zo-sveta");
  const [accent, setAccent] = useState(article?.accent ?? "forest");
  const [author, setAuthor] = useState(article?.author ?? "Redakcia Psipedia");
  const [authorProfileId, setAuthorProfileId] = useState<number | null | undefined>(article ? article.authorProfileId : undefined);
  const [readingMinutes, setReadingMinutes] = useState(article?.readingMinutes ?? 5);
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? "");
  const [socialCaption,setSocialCaption] = useState(article?.socialCaption ?? "");
  const savedFacebookContent = useRef({caption:article?.socialCaption??"",title:article?.title??"",imageKey:article?.imageKey??""});
  const savedArticleRef = useRef<ManagedArticle | null>(article ?? null);
  const [saveReceipt, setSaveReceipt] = useState<ArticleSaveReceipt | null>(null);
  const [followupBefore, setFollowupBefore] = useState<ManagedArticle | null>(null);
  const [pendingFacebookSave, setPendingFacebookSave] = useState<PendingFacebookSave | null>(null);
  const [facebookReceipt, setFacebookReceipt] = useState<FollowupReceipt | null>(null);
  const [retryBusy, setRetryBusy] = useState<string | null>(null);
  const [intro, setIntro] = useState(article?.intro ?? "");
  const [introRichText, setIntroRichText] = useState(article?.introRichText ?? legacyRichTextToDocument(article?.intro ?? ""));
  const [takeaway, setTakeaway] = useState(article?.takeaway ?? "");
  const [takeawayRichText, setTakeawayRichText] = useState(article?.takeawayRichText ?? legacyRichTextToDocument(article?.takeaway ?? ""));
  const [imageUrl, setImageUrl] = useState(article?.image ?? "");
  const [imageKey, setImageKey] = useState(article?.imageKey ?? "");
  const [thumbnailImageDisplay, setThumbnailImageDisplay] = useState<ImageDisplayConfig | null>(article?.thumbnailImageDisplay ?? legacyArticleThumbnail(article?.imageDisplay, article?.imageFocusX, article?.imageFocusY));
  const [detailImageDisplay, setDetailImageDisplay] = useState<ImageDisplayConfig | null>(article?.detailImageDisplay ?? legacyArticleDetail(article?.imageDisplay, article?.imageFocusX, article?.imageFocusY));
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [imageAlt, setImageAlt] = useState(article?.imageAlt ?? "");
  const [imageCaption, setImageCaption] = useState(article?.imageCaption ?? "");
  const [imageCredit, setImageCredit] = useState(article?.imageCredit ?? "");
  const [imageCreditUrl, setImageCreditUrl] = useState(article?.imageCreditUrl ?? "");
  const [publishedAt, setPublishedAt] = useState(dateTimeValue(article?.publishedAt));
  const [contentUpdatedAt, setContentUpdatedAt] = useState(article?.contentUpdatedAt?.slice(0, 10) ?? "");
  const [fbPost,setFbPost] = useState<FacebookImagePost|null>(null);
  const [fbLoaded,setFbLoaded] = useState(!article);
  const [fbError,setFbError] = useState("");
  const [fbDraftBusy,setFbDraftBusy] = useState(false);
  async function stageFacebookArticleDraft() {
    if (!article || fbDraftBusy) return;
    setFbDraftBusy(true); setFbError("");
    try {
      const response = await fetch("/api/admin/facebook-articles/" + article.id, {
        method: "POST", credentials: "same-origin", cache: "no-store",
      });
      const result = await response.json() as { post?: FacebookImagePost; error?: string };
      if (!response.ok || !result.post)
        throw new Error(result.error || "Koncept Facebook článku sa nepodarilo vytvoriť.");
      setFbPost(result.post); setFbLoaded(true);
      setMessage("Facebook koncept je pripravený v sekcii Facebook obrázky. Text a termín môžeš upraviť nižšie v editore článku.");
    } catch (error) {
      setFbError(error instanceof Error ? error.message : "Príprava zlyhala.");
    } finally { setFbDraftBusy(false); }
  }
  const [fbEnabled,setFbEnabled] = useState(false);
  const [fbDateTime,setFbDateTime] = useState("");
  const [fbRepeatedHour,setFbRepeatedHour] = useState("");
  const [fbMode,setFbMode] = useState<"photo"|"graphic">("photo");
  const [fbGraphic,setFbGraphic] = useState({imageKey:"",imageUrl:""});
  const [fbLink,setFbLink] = useState(true);
  const [fbApprove,setFbApprove] = useState(false);
  const [fbDirty,setFbDirty] = useState(false);
  const [fbGenerating,setFbGenerating] = useState(false);
  useEffect(()=>{
    if(!article?.id)return;
    const controller=new AbortController();
    fetch(`/api/admin/facebook-articles/${article.id}`,{cache:"no-store",signal:controller.signal})
      .then(async response=>{
        const result=await response.json() as {post:FacebookImagePost|null;error?:string};
        if(!response.ok)throw new Error(result.error||"Kalendár nie je dostupný.");
        if(controller.signal.aborted)return;
        const post=result.post;
        setFbPost(post);setFbEnabled(post?.status==="scheduled");setFbApprove(post?.approvalStatus==="APPROVED");
        setFbMode(post?.articleImageMode??"photo");setFbLink(post?.articleIncludeLink??true);
        if(post?.scheduledAt){const wall=facebookWallTime(post.scheduledAt);setFbDateTime(`${wall.date}T${wall.time}`);
          setFbRepeatedHour(facebookScheduleInstant(wall.date,wall.time,"earlier")===post.scheduledAt?"earlier":"later");}
        if(post?.articleImageMode==="graphic")setFbGraphic({imageKey:post.imageKey,imageUrl:post.imageUrl});
        setFbLoaded(true);
      }).catch(error=>{if(!controller.signal.aborted)setFbError(error instanceof Error?error.message:"Kalendár nie je dostupný.");});
    return()=>controller.abort();
  },[article?.id]);
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
  // Keep persisted lifecycle separate from display: an elapsed schedule is public
  // without a write to managed_articles or to the Notion import mapping.
  const [status, setStatus] = useState<ArticleStatus>(article?.status ?? "draft");
  const [confirmedPublishedAt, setConfirmedPublishedAt] = useState(article?.publishedAt ?? null);
  const [statusClock, setStatusClock] = useState(() => Date.now());
  const displayedStatus = effectiveArticleStatus(status, confirmedPublishedAt, statusClock);
  useEffect(() => {
    const refresh = () => setStatusClock(Date.now());
    window.addEventListener("focus", refresh);
    const due = confirmedPublishedAt ? Date.parse(confirmedPublishedAt) : NaN;
    const remaining = due - Date.now();
    const timeout = status === "scheduled" && Number.isFinite(due)
      && remaining >= 0 && remaining <= 2147483646
      ? window.setTimeout(refresh, remaining + 1) : null;
    return () => {
      window.removeEventListener("focus", refresh);
      if (timeout !== null) window.clearTimeout(timeout);
    };
  }, [status, confirmedPublishedAt]);
  const [saving, setSaving] = useState(false);
  const savePendingRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [qaIssues, setQaIssues] = useState<ArticleQaIssue[]>([]);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [fullscreenPreviewOpen, setFullscreenPreviewOpen] = useState(false);
  const [activeArticleSection, setActiveArticleSection] = useState<string>("article-blocks");
  const [qaFocusRequest, setQaFocusRequest] = useState<{ sectionId: string } | null>(null);
  const [dirty, setDirtyState] = useState(false);
  const lastSavedUpdatedAtRef = useRef(article?.updatedAt ?? null);
  const allowNavigationRef = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  function chooseArticleSection(id: string) {
    // Title and excerpt are in the same workspace as the Tiptap document.
    const visibleId = id === "article-basics" ? "article-blocks" : id;
    if (!editorNavigation.some((section) => section.id === visibleId)) return;
    setActiveArticleSection(visibleId);
    // Wait until React has revealed the selected panel before scrolling.
    window.requestAnimationFrame(() => {
      document.getElementById(visibleId)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }
  // Focus only after React has rendered the newly revealed QA-blocked section.
  // Each new request also supports repeated validation failures in one section.
  useLayoutEffect(() => {
    if (!qaFocusRequest || activeArticleSection !== qaFocusRequest.sectionId) return;
    const panel = document.getElementById(qaFocusRequest.sectionId);
    if (panel?.hidden) return;
    panel?.focus({ preventScroll: true });
  }, [activeArticleSection, qaFocusRequest]);

  const focusResult = () => window.requestAnimationFrame(() => {
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    resultRef.current?.focus({ preventScroll: true });
  });
  const [relatedBreedIds,setRelatedBreedIds]=useState(article?.relatedBreedIds??[]);
  const [breedSearch, setBreedSearch] = useState("");
  const [breedPickerOpen, setBreedPickerOpen] = useState(false);
  const [breedVisibleLimit, setBreedVisibleLimit] = useState(12);
  const normalizeBreed = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const breedQuery = normalizeBreed(breedSearch);
  const matchingBreeds = breedOptions.filter((item) =>
    !breedQuery || normalizeBreed(`${item.name} ${item.fciNumber ?? ""}`).includes(breedQuery));
  const selectedBreeds = breedOptions.filter((item) => relatedBreedIds.includes(item.id));
  const unselectedBreeds = matchingBreeds.filter((item) => !relatedBreedIds.includes(item.id));
  const visibleBreeds = [...matchingBreeds.filter((item) => relatedBreedIds.includes(item.id)), ...unselectedBreeds.slice(0, breedVisibleLimit)];

  const [topicIds, setTopicIds] = useState(article?.topics.map((topic) => topic.id) ?? []);

  function setEditorDirty(value: boolean) {
    setDirtyState(value);
  }

  function changeFacebook(){setFbDirty(true);setFbApprove(false);setEditorDirty(true);}
  async function makeFacebookGraphic(){
    if(!imageUrl||!title.trim()||fbGenerating)return;
    setFbGenerating(true);setError("");
    try{
      const { createFacebookArticleGraphic } = await import("@/lib/facebook-article-graphic");
      const graphic=await createFacebookArticleGraphic(imageUrl,title);
      const upload=await uploadAdminImage(graphic,"facebook-images");
      setFbGraphic({imageKey:upload.imageKey,imageUrl:upload.imageUrl});
      setFbMode("graphic");changeFacebook();
    }catch(error){setError(error instanceof Error?error.message:"Grafiku sa nepodarilo vytvoriť.");}
    finally{setFbGenerating(false);}
  }
  function changeTitle(value: string) {
    if(fbPost?.status==="scheduled"||fbEnabled){changeFacebook();if(fbMode==="graphic")setFbGraphic({imageKey:"",imageUrl:""});}
    setTitle(value);
    if (!slugEdited) setSlug(slugify(value, 60));
  }

  function changePortalSection(value: ArticlePortalSection) {
    if (value === portalSection) return;
    setPortalSection(value);
    const nextAreas = areasFor(value);
    // Do not silently assign the first area of a different section.
    if (!nextAreas.some((area) => area.slug === portalSubpage)) setPortalSubpage("");
  }

  async function uploadImage(event: File | ChangeEvent<HTMLInputElement>) {
    const file = adminSelectedImage(event);
    if (!file) return;
    setUploading(true);
    setError("");
    setMessage("");
    setQaIssues([]);
    try {
      const data = await uploadAdminImage(file, "articles");
      setImageUrl(data.imageUrl);
      setImageKey(data.imageKey);
      if(fbPost?.status==="scheduled"||fbEnabled){changeFacebook();if(fbMode==="graphic")setFbGraphic({imageKey:"",imageUrl:""});}
      setThumbnailImageDisplay(null);
      setDetailImageDisplay(null);
      setEditorDirty(true);
      setMessage(adminImageUploadMessage(data, "Ulož článok, aby sa zmena zachovala."));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Obrázok sa nepodarilo nahrať.");
    } finally {
      setUploading(false);
    }
  }

  async function uploadOgImage(event: File | ChangeEvent<HTMLInputElement>) {
    const file = adminSelectedImage(event);
    if (!file) return;
    setUploading(true); setError(""); setMessage("");
    try {
      const data = await uploadAdminImage(file, "articles");
      setOgImageUrl(data.imageUrl); setOgImageKey(data.imageKey); setEditorDirty(true);
      setMessage(adminImageUploadMessage(data, "Ulož článok, aby sa Open Graph obrázok zachoval."));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Open Graph obrázok sa nepodarilo nahrať.");
    } finally {
      setUploading(false);
    }
  }

  async function retryNotionStep(step: keyof ArticleSaveReceipt["notion"] | "lifecycle") {
    const persisted = savedArticleRef.current;
    if (!persisted || retryBusy || savePendingRef.current || dirty) return;
    setRetryBusy(step); setError("");
    try {
      const response = await fetch(`/api/admin/articles/${persisted.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        credentials: "same-origin", cache: "no-store",
        body: JSON.stringify({
          action: "retry-article-followup", step,
          expectedUpdatedAt: persisted.updatedAt,
          ...((step === "seo" || step === "placement") && followupBefore
            ? { before: followupBefore } : {}),
        }),
      });
      const data = await response.json() as { error?: string; saveReceipt?: ArticleSaveReceipt };
      if (!response.ok || !data.saveReceipt) throw new Error(data.error || "Nadväzujúci krok sa nepodarilo overiť.");
      const receipt = step === "lifecycle"
        ? data.saveReceipt.lifecycle : data.saveReceipt.notion[step];
      if (!receipt) throw new Error("Odpoveď neobsahuje výsledok nadväzujúceho kroku.");
      setSaveReceipt((current) => current ? {
        ...current,
        notion: { ...current.notion, ...data.saveReceipt?.notion },
        ...(step === "lifecycle" ? { lifecycle: receipt } : {}),
      } : data.saveReceipt!);
      if (receipt.status === "synced") setMessage("Nadväzujúci krok bol potvrdený. Článok v D1 sa nemenil.");
      else setMessage("Článok zostáva uložený v D1. Nadväzujúci krok: " + followupLabel(receipt) + ".");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Opakovanie kroku zlyhalo.");
    } finally { setRetryBusy(null); }
  }

  async function persistFacebookStep(pending: PendingFacebookSave, verifyRevision: boolean) {
    // A timed-out PUT may already have succeeded. Never submit a second
    // schedule against an unverified Facebook version.
    if (verifyRevision) {
      const check = await fetch(`/api/admin/facebook-articles/${pending.articleId}`, {
        credentials: "same-origin", cache: "no-store",
      });
      const current = await check.json() as { post: FacebookImagePost | null; error?: string };
      if (!check.ok) throw new Error(current.error || "Stav Facebook kalendára sa nepodarilo overiť.");
      if ((current.post?.version ?? null) !== (pending.expectedVersion ?? null)) {
        setFbPost(current.post);
        throw new Error("Facebook kalendár sa medzičasom zmenil. Skontroluj jeho aktuálny stav pred ďalšou úpravou.");
      }
    }
    const response = await fetch(`/api/admin/facebook-articles/${pending.articleId}`, {
      method: "PUT", credentials: "same-origin", cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pending.payload),
    });
    const result = await response.json() as { post: FacebookImagePost | null; error?: string };
    if (!response.ok || !result.post) throw new Error(result.error || "Facebook nastavenia sa nepodarilo uložiť.");
    setFbPost(result.post);
    setFbLoaded(true);
    setFbApprove(result.post.approvalStatus === "APPROVED");
    setFbDirty(false); setFbError(""); setPendingFacebookSave(null);
    setFacebookReceipt({ status: "synced" });
    savedFacebookContent.current = { caption: socialCaption.trim(), title, imageKey: imageKey || "" };
  }

  async function retryFacebookStep() {
    if (!pendingFacebookSave || retryBusy || savePendingRef.current || dirty) return;
    setRetryBusy("facebook"); setError(""); setFbError("");
    try {
      await persistFacebookStep(pendingFacebookSave, true);
      setMessage("Facebook nastavenia sú uložené. Článok v D1 sa znovu nezapisoval.");
      if (!article) {
        allowNavigationRef.current = true;
        router.replace(`/admin/clanky/${pendingFacebookSave.articleId}?vytvoreny=1`);
      }
    } catch (reason) {
      setFacebookReceipt({ status: "failed", code: "FACEBOOK_RETRY_NOT_CONFIRMED" });
      setFbError(reason instanceof Error ? reason.message : "Facebook nastavenia sa nepodarilo uložiť.");
    } finally { setRetryBusy(null); }
  }

  async function save(nextStatus: ArticleStatus) {
    // Never save a stale parent snapshot when a Tiptap field rejected a change.
    if (document.querySelector('[data-article-tiptap-invalid="true"]')) {
      setError("Niektorý textový blok obsahuje nepodporované formátovanie. Pred uložením uprav označený blok.");
      setMessage("");
      return;
    }
    if (savePendingRef.current || uploading) return;
    savePendingRef.current = true;
    setSaving(true);
    setError("");
    setMessage("");

    const requestedPublishedAt = publishedAt ? new Date(publishedAt) : null;
    // Preserve the true historical publish time if the schedule has elapsed.
    const effectivePublishedAt = nextStatus === "published" && status === "scheduled" && displayedStatus === "published" && confirmedPublishedAt
      ? new Date(confirmedPublishedAt)
      : nextStatus === "published" && requestedPublishedAt && requestedPublishedAt.getTime() > statusClock
        ? new Date()
        : requestedPublishedAt;
    const currentArticle = savedArticleRef.current;
    const preservedMetadata = preservedEditorArticleMetadata(currentArticle ?? undefined, {
      portalSection,
      portalSubpage: currentAreas.length || originalAreaHidden ? portalSubpage : null,
      imageUrl: imageUrl || null,
    });
    const payload = {
      title,
      slug,
      category: portalSection === "clanky"
        ? category
        : articleCategoryForPortalPlacement(portalSection, portalSubpage),
      portalSection,
      portalSubpage: preservedMetadata.portalSubpage,
      newsCategory: portalSection === "novinky" ? newsCategory : null,
      accent,
      author,
      authorProfileId: currentArticle && authorProfileId === currentArticle.authorProfileId && author === currentArticle.author ? undefined : authorProfileId,
      readingMinutes,
      excerpt,
      intro,
      introRichText,
      takeaway,
      takeawayRichText,
      imageUrl: imageUrl || null,
      imageKey: imageKey || null,
      imageDisplay: preservedMetadata.imageDisplay,
      imageFocusX: preservedMetadata.imageFocusX,
      imageFocusY: preservedMetadata.imageFocusY,
      thumbnailImageDisplay,
      detailImageDisplay,
      imageAlt: imageAlt || null,
      imageCaption: imageCaption || null,
      imageCredit: imageCredit || null,
      imageCreditUrl: imageCreditUrl || null,
      status: nextStatus,
      blocks,
      sections: preservedMetadata.sections,
      sources: preservedMetadata.sources,
      publishedAt: effectivePublishedAt?.toISOString() ?? null,
      contentUpdatedAt: contentUpdatedAt ? new Date(`${contentUpdatedAt}T12:00:00`).toISOString() : null,
      showUpdated,
      socialCaption,
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
      topicIds,
      expectedUpdatedAt: lastSavedUpdatedAtRef.current ?? undefined,
    };

    let hasQaIssues = false;
    try {
      const endpoint = currentArticle ? `/api/admin/articles/${currentArticle.id}` : "/api/admin/articles";
      const response = await fetch(endpoint, {
        method: currentArticle ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        article?: ManagedArticle; error?: string; issues?: ArticleQaIssue[];
        saveReceipt?: ArticleSaveReceipt;
      };
      if (!response.ok || !data.article) {
        if (Array.isArray(data.issues)) {
          hasQaIssues = data.issues.length > 0;
          setQaIssues(data.issues);
          const firstBlocker = data.issues.find((item) => item.severity === "BLOCKER");
          const targetId = firstBlocker?.blockId ? "article-blocks"
            : firstBlocker?.field === "title" || firstBlocker?.field === "excerpt" ? "article-basics"
              : firstBlocker?.field.startsWith("sources") || firstBlocker?.field.startsWith("blocks") ? "article-blocks"
                : firstBlocker?.field === "intro" ? "article-content" : "article-publish";
          const targetSectionId = targetId === "article-content" ? "article-basics" : targetId;
          const visibleTargetId = targetSectionId === "article-basics" ? "article-blocks" : targetSectionId;
          chooseArticleSection(visibleTargetId);
          setQaFocusRequest({ sectionId: visibleTargetId });
        }
        throw new Error(data.error || "Článok sa nepodarilo uložiť.");
      }

      // The API returned a successful canonical write. Any later failure is
      // a separate receipt and never a failed article save.
      savedArticleRef.current = data.article;
      setFollowupBefore(currentArticle);
      setStatus(data.article.status);
      setConfirmedPublishedAt(data.article.publishedAt);
      lastSavedUpdatedAtRef.current = data.article.updatedAt;
      setPublishedAt(dateTimeValue(data.article.publishedAt));
      setSaveReceipt(data.saveReceipt ?? {
        d1: { status: "saved", updatedAt: data.article.updatedAt }, notion: {},
      });
      setEditorDirty(false);
      const changedContent = socialCaption.trim()!==savedFacebookContent.current.caption.trim()
        || title!==savedFacebookContent.current.title || (imageKey||"")!==savedFacebookContent.current.imageKey;
      const updateFb = (fbDirty && fbPost?.status!=="published") || (!currentArticle && fbEnabled)
        || (fbPost!==null && fbPost.status!=="published" && changedContent);
      let facebookFailed = false;
      if (updateFb) {
        const [date,time] = fbDateTime.split("T");
        const pending: PendingFacebookSave = {
          articleId: data.article.id,
          expectedVersion: fbPost?.version,
          payload: { enabled: fbEnabled, date: date || "", time: time || "",
            repeatedHour: fbRepeatedHour, imageMode: fbMode,
            graphicImageKey: fbGraphic.imageKey, includeLink: fbLink,
            approve: fbApprove, expectedVersion: fbPost?.version },
        };
        setPendingFacebookSave(pending);
        try {
          if (!fbLoaded || fbError) throw new Error("Facebook kalendár nebol načítaný. Over jeho stav a zopakuj iba Facebook krok.");
          await persistFacebookStep(pending, false);
        } catch (facebookError) {
          facebookFailed = true;
          setFacebookReceipt({ status: "failed", code: "FACEBOOK_SETTINGS_NOT_CONFIRMED" });
          setFbError(facebookError instanceof Error ? facebookError.message : "Facebook nastavenia sa neuložili.");
        }
      } else {
        setPendingFacebookSave(null);
        setFacebookReceipt({ status: "skipped", code: "bez zmien" });
        savedFacebookContent.current = { caption: socialCaption.trim(), title, imageKey: imageKey || "" };
      }
      setMessage(nextStatus === "published"
        ? (portalSection === "novinky" ? "Novinka je uložená a publikovaná v D1." : "Článok je uložený a publikovaný v D1.")
        : nextStatus === "scheduled" ? "Plánovanie článku je uložené v D1." : "Koncept je uložený v D1.");
      focusResult();
      // Keep the receipt visible for any failed follow-up, including when
      // returning to the calendar. Never POST a second article after creation.
      const hasUnresolvedFollowup =
        Object.values(data.saveReceipt?.notion ?? {}).some((step) =>
          step && ["failed", "partial", "deferred"].includes(step.status)) ||
        data.saveReceipt?.lifecycle?.status === "failed" ||
        data.saveReceipt?.media?.status === "failed";
      if (!facebookFailed && !hasUnresolvedFollowup) {
        if (returnToCalendar && nextStatus === "draft") {
          allowNavigationRef.current = true;
          router.replace(returnToCalendar);
        } else if (!article) {
          allowNavigationRef.current = true;
          router.replace(`/admin/clanky/${data.article.id}?vytvoreny=1`);
        }
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Článok sa nepodarilo uložiť.");
      // Preserve the QA blocker focus selected above; only generic errors focus the result.
      if (!hasQaIssues) focusResult();
    } finally {
      savePendingRef.current = false;
      setSaving(false);
    }
  }

  function cancelEditing() {
    // EditorWorkspace confirms discard before invoking this callback.
    allowNavigationRef.current = true;
    setEditorDirty(false);
    if (returnToCalendar) router.push(returnToCalendar);
    else router.push("/admin/clanky");
  }

  // Hidden required controls cannot be reached by native form validation.
  // Preserve the original submit checks and let server QA own publish rules.
  function submitArticleForm() {
    const missing =
      !title.trim() ? { section: "article-blocks", label: "Vyplň názov článku." } :
      !excerpt.trim() ? { section: "article-blocks", label: "Vyplň krátky úvod na karte." } :
      !intro.trim() ? { section: "article-blocks", label: "Vyplň úvod článku." } :
      !slug.trim() ? { section: "article-settings", label: "Vyplň adresu článku." } :
      portalSection !== "novinky" && portalSection !== "clanky"
        && (currentAreas.length > 0 || originalAreaHidden) && !portalSubpage.trim()
          ? { section: "article-settings", label: "Vyber oblasť článku." } : null;
    if (missing) {
      setError(missing.label);
      setMessage("");
      chooseArticleSection(missing.section);
      focusResult();
      return;
    }
    void save(displayedStatus);
  }

  return (
    <>
      <div className={editorStyles.workspaceRoot}>
      <EditorWorkspace
        mode="page"
        title={article ? "Upraviť článok" : "Nový článok"}
        articleLayout
        sections={editorNavigation}
        sectionMode="switch"
        activeSectionId={activeArticleSection}
        onSectionChange={setActiveArticleSection}
        dirty={dirty}
        allowNativeExitRef={allowNavigationRef}
        onClose={cancelEditing}
        closeLabel={returnToCalendar ? "Späť do kalendára" : "Späť na články"}
        previewTitle="Živý náhľad článku"
        preview={
          <div className={editorStyles.rightRail} data-article-editor-rail>
            <section className={editorStyles.railCard} aria-label="Stav článku">
              <div className={editorStyles.railHeading}>
                <h3><CheckCircle2 size={17} aria-hidden="true" /> Stav článku</h3>
                <span className={editorStyles.railStatus} data-publication-state={displayedStatus}>
                  {articleEffectiveStatusLabel(displayedStatus)}
                </span>
              </div>
              <p className={editorStyles.railNote}>
                {dirty ? "V editore sú neuložené zmeny." : article ? "Všetky zmeny boli uložené." : "Nový článok ešte nebol uložený."}
              </p>
              {displayedStatus === "scheduled" && publishedAt && (
                <p className={editorStyles.railMeta}><Clock3 size={14} aria-hidden="true" /> Termín: {publishedAt.replace("T", " ")}</p>
              )}
            </section>

            <section className={editorStyles.railCard} aria-label="Publikovanie článku">
              <div className={editorStyles.railHeading}>
                <h3><CalendarDays size={17} aria-hidden="true" /> Publikovanie</h3>
              </div>
              <p className={editorStyles.railMeta} data-article-publication-summary>
                {publishedAt ? `Termín: ${publishedAt.replace("T", " ")}` : "Bez naplánovaného termínu"}
              </p>
              <p className={editorStyles.railNote}>
                Termín a publikačné akcie upravíš na jednom mieste v sekcii Publikovanie.
              </p>
              <button type="button" className={editorStyles.railTextLink}
                onClick={() => chooseArticleSection("article-publish")}>
                Otvoriť nastavenia publikovania
              </button>
            </section>

            <details className={editorStyles.railCard} data-article-rail-seo>
              <summary className={editorStyles.railSummary}>
                <span><Search size={17} aria-hidden="true" /> SEO a zdieľanie</span>
                <ChevronDown size={17} aria-hidden="true" />
              </summary>
              <div className={editorStyles.railDetails}>
                <p><strong>SEO titulok</strong><span>{seoTitle.trim() || title.trim() || "Zatiaľ bez názvu"}</span></p>
                <p><strong>Meta popis</strong><span>{metaDescription.trim() || excerpt.trim() || "Použije sa perex článku."}</span></p>
                <p><strong>Indexovanie</strong><span>{noindex ? "Neindexovať" : "Povolené"}</span></p>
                <button type="button" className={editorStyles.railTextLink}
                  onClick={() => chooseArticleSection("article-seo")}>Upraviť všetky SEO polia</button>
              </div>
            </details>

            <section className={editorStyles.railCard} aria-label="Živý náhľad článku">
              <div className={editorStyles.railHeading}>
                <h3><Eye size={17} aria-hidden="true" /> Živý náhľad</h3>
                {previewOpen && (
                  <button type="button" className={editorStyles.railTextLink}
                    onClick={() => {
                      document.querySelector<HTMLButtonElement>('[data-editor-layout="article"] [data-editor-navigation] button[aria-pressed="true"]')?.click();
                      setPreviewOpen(false);
                    }}>Skryť náhľad</button>
                )}
              </div>
              {previewOpen ? (
                <>
                  <div className={editorStyles.railPreviewCard} data-article-compact-preview>
                    {imageUrl ? (
                      <div className={editorStyles.railPreviewPhoto}>
                        <ImageDisplay context="thumbnail" config={thumbnailImageDisplay}
                          src={imageUrl} alt={imageAlt || title || "Titulná fotografia článku"} loading="lazy" />
                      </div>
                    ) : (
                      <div className={editorStyles.railPreviewEmpty}><Camera size={23} aria-hidden="true" /><span>Bez titulnej fotografie</span></div>
                    )}
                    <div className={editorStyles.railPreviewText}>
                      <span>{portalSectionLabel(portalSection)}</span>
                      <h4>{title || "Názov tvojho článku"}</h4>
                      <p>{excerpt || "Tu sa zobrazí krátky úvod článku."}</p>
                    </div>
                  </div>
                  <button type="button" className={editorStyles.railExpand}
                    onClick={() => setFullscreenPreviewOpen(true)}>
                    Náhľad na celú obrazovku · počítač/mobil
                  </button>
                </>
              ) : (
                <button type="button" className={editorStyles.railExpand} onClick={() => setPreviewOpen(true)}>
                  Ukázať náhľad
                </button>
              )}
            </section>
          </div>
        }
        actions={<EditorActionBar
          message={<span className="admin-editor-dirty-state">{dirty ? "Neuložené zmeny" : pendingFacebookSave ? "Článok uložený · Facebook čaká" : savedArticleRef.current ? "Článok uložený v D1" : "Nový článok zatiaľ nie je uložený"}</span>}
          destructive={article ? <AdminRecordLifecycleActions kind="articles" recordId={article.id} status={displayedStatus} disabled={saving || uploading} returnHref="/admin/clanky" onUnpublished={(_next,updatedAt)=>{setStatus("draft");if(updatedAt)lastSavedUpdatedAtRef.current=updatedAt;}} /> : undefined}
          primary={<>
            <span className={editorStyles.desktopActions}>
              <AdminActionButton variant="secondary" type="submit" form="article-canonical-editor-form" disabled={saving || uploading}>{saving ? "Ukladám…" : displayedStatus === "published" ? "Uložiť zmeny" : displayedStatus === "scheduled" ? "Uložiť plánovaný článok" : "Uložiť koncept"}</AdminActionButton>
              {displayedStatus !== "published" && <AdminActionButton variant="secondary" disabled={saving || uploading || !publishedAt} onClick={() => void save("scheduled")}>Naplánovať publikovanie</AdminActionButton>}
              <AdminActionButton variant="primary" disabled={saving || uploading} onClick={() => void save("published")}>{saving ? "Ukladám…" : displayedStatus === "published" ? "Uložiť a aktualizovať" : `Publikovať ${portalSection === "novinky" ? "novinku" : "článok"}`}</AdminActionButton>
            </span>
            <span className={editorStyles.mobileActions}>
              <AdminActionButton variant="primary" type="submit" form="article-canonical-editor-form" disabled={saving || uploading}>
                {saving ? "Ukladám…" : displayedStatus === "published" ? "Uložiť a aktualizovať" : displayedStatus === "scheduled" ? "Uložiť plánovaný článok" : "Uložiť koncept"}
              </AdminActionButton>
            </span>
          </>}
        />}
      >
      <AdminTiptapArticleScope activeSectionId={activeArticleSection}>
      <form id="article-canonical-editor-form" noValidate className={`admin-editor-form ${editorStyles.articleForm}`} onChange={(event) => { if (!(event.target as HTMLElement).closest("dialog")) setEditorDirty(true); }} onInput={(event) => { if (!(event.target as HTMLElement).closest("dialog")) setEditorDirty(true); }} onSubmit={(event) => { event.preventDefault(); submitArticleForm(); }}>
        {(message || error || saving) && <div ref={resultRef} tabIndex={-1}>
          <AdminFormFeedback message={message} error={error} pending={saving} className="admin-editor-message" errorClassName="is-error" successClassName="is-success" />
        </div>}
        {saveReceipt && <div role="status" aria-live="polite" className="admin-editor-message">
          <p><strong>D1:</strong> Článok, jeho stav publikovania a uložené údaje sú potvrdené (verzia {saveReceipt.d1.updatedAt}).</p>
          {saveReceipt.assignments?.status === "synced" && <p><strong>Priradenia:</strong> témy a prepojené plemená sú uložené v D1.</p>}
          {Object.entries(saveReceipt.notion).map(([key, receipt]) => {
            const step = key as keyof ArticleSaveReceipt["notion"];
            if (!receipt) return null;
            const blockedByPrevious = step === "seo" || step === "draft"
              ? ["failed", "partial", "deferred"].includes(saveReceipt.notion.placement?.status ?? "")
              : false;
            const blockedBySeo = step === "draft" &&
              ["failed", "partial", "deferred"].includes(saveReceipt.notion.seo?.status ?? "");
            const canRetry = ["failed", "partial", "deferred"].includes(receipt.status) &&
              !blockedByPrevious && !blockedBySeo && ((step !== "seo" && step !== "placement") || !!followupBefore);
            return <p key={key}>
              <strong>{notionStepNames[step]}:</strong> {followupLabel(receipt)}
              {receipt.code ? ` (${receipt.code})` : ""}{receipt.fields?.length ? ` · polia: ${receipt.fields.join(", ")}` : ""}
              {canRetry && <button type="button" disabled={!!retryBusy || saving || dirty}
                onClick={() => void retryNotionStep(step)}> {retryBusy === step ? "Overujem…" : "Zopakovať iba tento krok"}</button>}
            </p>;
          })}
          {saveReceipt.lifecycle?.status === "failed" && <p>
            Potvrdenie publikovania: nedokončené.
            <button type="button" disabled={!!retryBusy || saving || dirty}
              onClick={() => void retryNotionStep("lifecycle")}>Zopakovať iba potvrdenie</button>
          </p>}
          {saveReceipt.media?.status === "failed" && <p>R2: čistenie nepoužitých obrázkov nebolo potvrdené. Uložené médiá článku zostali zachované.</p>}
          {facebookReceipt && !pendingFacebookSave && <p><strong>Facebook:</strong> {followupLabel(facebookReceipt)}{facebookReceipt.status === "skipped" ? " (bez zmeny nastavení)" : " (nastavenia v kalendári)"}.</p>}
          {pendingFacebookSave && <p>
            <strong>Facebook:</strong> nastavenia sa nepodarilo potvrdiť; článok je už uložený v D1.
            {fbError && ` ${fbError}`}
            <button type="button" disabled={!!retryBusy || saving || dirty}
              onClick={() => void retryFacebookStep()}>{retryBusy === "facebook" ? "Overujem…" : "Overiť a zopakovať iba Facebook"}</button>
          </p>}
        </div>}
        {qaIssues.length > 0 && (
          <section className="admin-form-card" aria-live="polite" aria-label="Publikačná kontrola">
            <div className="admin-card-heading">
              <div><span>QA</span><div><h2>{qaIssues.some((item) => item.severity === "BLOCKER") ? "Chýbajú povinné údaje" : "Vyžaduje kontrolu"}</h2><p>Publikačná kontrola našla {qaIssues.length} {qaIssues.length === 1 ? "položku" : "položiek"}. Koncept môžeš ďalej ukladať.</p></div></div>
            </div>
            <ul>
              {qaIssues.map((item, index) => (
                <li key={`${item.code}-${item.blockId ?? item.field}-${index}`}>
                  <strong>{item.severity}: {item.message}</strong>
                  <div>{item.suggestedAction}</div>
                  <small>Kód: {item.code}{item.blockId ? ` · blok ${item.blockId}` : ""}</small>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!previewOpen && <button type="button" className={editorStyles.previewRestore} onClick={() => setPreviewOpen(true)}>Ukázať náhľad článku</button>}
<section id="article-publish" hidden={activeArticleSection !== "article-publish"} tabIndex={activeArticleSection === "article-publish" ? -1 : undefined} data-editor-section-active={activeArticleSection === "article-publish" ? "true" : "false"} data-admin-editor-section className="admin-form-card">
          <div className="admin-card-heading"><div><span>01</span><div><h2>Publikovanie</h2><p>Termín publikovania a redakčná aktualizácia.</p></div></div></div>
          <p data-article-current-status aria-live="polite">Aktuálny stav: {articleEffectiveStatusLabel(displayedStatus)}</p>
          <div className={editorStyles.mobileExtraActions} aria-label="Ďalšie publikačné akcie">
            {displayedStatus !== "published" && <AdminActionButton variant="secondary" disabled={saving || uploading || !publishedAt} onClick={() => void save("scheduled")}>Naplánovať publikovanie</AdminActionButton>}
            {displayedStatus !== "published" && <AdminActionButton variant="secondary" disabled={saving || uploading} onClick={() => void save("published")}>Publikovať {portalSection === "novinky" ? "novinku" : "článok"}</AdminActionButton>}
            {article && <div className={editorStyles.mobileLifecycleActions}>
              <AdminRecordLifecycleActions kind="articles" recordId={article.id} status={displayedStatus}
                disabled={saving || uploading} returnHref="/admin/clanky"
                onUnpublished={(_next,updatedAt)=>{setStatus("draft");if(updatedAt)lastSavedUpdatedAtRef.current=updatedAt;}} />
            </div>}
          </div>
          <div className="admin-field-grid">
            <div className="admin-field">
              <label htmlFor="article-published-at">Dátum a čas publikovania</label>
              <input id="article-published-at" type="datetime-local" value={publishedAt} readOnly={displayedStatus === "published"} onChange={(event) => setPublishedAt(event.target.value)} />
              <small>Pri okamžitom publikovaní môže zostať prázdny.</small>
              <ArticleEditorCalendar value={publishedAt} articleId={article?.id} readOnly={displayedStatus === "published"}
                onChoose={(nextDate) => { setPublishedAt(nextDate); setEditorDirty(true); }} />
            </div>
            <div className="admin-field"><label htmlFor="article-updated-at">Dátum aktualizácie</label><input id="article-updated-at" type="date" value={contentUpdatedAt} onChange={(event) => setContentUpdatedAt(event.target.value)} /></div>
          </div>
          <details className={editorStyles.editorDisclosure} data-article-facebook-disclosure defaultOpen={Boolean(fbEnabled || fbDateTime || fbError)}>
            <summary>Facebook a sociálne siete <span>{fbPost?.status === "scheduled" ? "Naplánované" : fbEnabled ? "Aktívne" : "Voliteľné"}</span></summary>
          <div className="admin-field" data-facebook-article-controls>
            {article && !fbPost && <button type="button" className="admin-secondary-button"
              disabled={fbDraftBusy || !fbLoaded} onClick={() => void stageFacebookArticleDraft()}>
              {fbDraftBusy ? "Pripravujem Facebook koncept…" : "Pripraviť článok do Facebook obrázkov"}
            </button>}
            {article && <small>Fotografia a odkaz článku sa prevezmú do existujúceho Facebook kalendára ako neverejný koncept.</small>}
            <label htmlFor="article-facebook-at">Dátum a čas publikovania na Facebooku</label>
            <input id="article-facebook-at" type="datetime-local" value={fbDateTime}
              disabled={!fbLoaded||fbPost?.status==="published"}
              onChange={event=>{setFbDateTime(event.target.value);setFbEnabled(Boolean(event.target.value));changeFacebook();}}/>
            <small>Spoločný kalendár s Facebook obrázkami · časové pásmo Bratislava.</small>
            <label className="admin-check"><input type="checkbox" checked={fbEnabled}
              disabled={!fbLoaded||fbPost?.status==="published"}
              onChange={event=>{setFbEnabled(event.target.checked);changeFacebook();}}/>
              <span>Naplánovať Facebook článok</span></label>
            <label htmlFor="article-social-caption">Popis na sociálne siete</label>
            <textarea id="article-social-caption" rows={4} maxLength={15000} value={socialCaption}
              onChange={event=>{setSocialCaption(event.target.value);setEditorDirty(true);if(fbPost?.status==="scheduled"||fbEnabled)changeFacebook();}}
              placeholder="Text k fotografii a článku na Facebooku."/>
            <small>{socialCaption.length} znakov · toto pole má byť aj v databáze Články v Notione.</small>
            <label className="admin-check"><input type="checkbox" checked={fbLink}
              disabled={!fbLoaded||fbPost?.status==="published"}
              onChange={event=>{setFbLink(event.target.checked);changeFacebook();}}/>
              <span>Vložiť URL článku do textu fotografie (nie klasické zdieľanie odkazu)</span></label>
            <label>Forma obrázka
              <select value={fbMode} disabled={!fbLoaded||fbPost?.status==="published"}
                onChange={event=>{setFbMode(event.target.value as "photo"|"graphic");changeFacebook();}}>
                <option value="photo">Pôvodná titulná fotografia</option>
                <option value="graphic">Fotografia s nadpisom článku</option>
              </select>
            </label>
            {fbMode==="graphic"&&<>
              <button type="button" disabled={!imageUrl||fbGenerating||!fbLoaded} onClick={()=>void makeFacebookGraphic()}>
                {fbGenerating?"Vytváram grafiku…":"Vytvoriť obrázok s nadpisom"}
              </button>
              {fbGraphic.imageUrl&&<img src={fbGraphic.imageUrl} alt="Náhľad Facebook grafiky"
                width={480} height={300} style={{maxWidth:"100%",height:"auto"}}/>}
              <small>Vznikne nový PNG súbor, originál článku zostáva nezmenený.</small>
            </>}
            <label>Opakovaný čas pri prechode na zimný čas
              <select value={fbRepeatedHour} disabled={!fbLoaded||fbPost?.status==="published"}
                onChange={event=>{setFbRepeatedHour(event.target.value);changeFacebook();}}>
                <option value="">Automaticky</option>
                <option value="earlier">Prvý výskyt</option>
                <option value="later">Druhý výskyt</option>
              </select>
            </label>
            <label className="admin-check"><input type="checkbox" checked={fbApprove}
              disabled={!fbLoaded||!fbEnabled||fbPost?.status==="published"}
              onChange={event=>{setFbApprove(event.target.checked);setFbDirty(true);setEditorDirty(true);}}/>
              <span>Individuálne povoliť publikovanie (globálny STOP zostáva platný)</span></label>
            {fbPost&&<small>Stav FB: {fbPost.status==="published"?"Publikovaný":fbPost.status==="scheduled"?"Naplánovaný":"Koncept"} · <Link href="/admin/facebook-obrazky">Spoločný kalendár</Link></small>}
            {fbError&&<p role="alert">{fbError}</p>}
          </div>
          </details>
          <label className="admin-check"><input type="checkbox" checked={showUpdated} onChange={(event) => setShowUpdated(event.target.checked)} /><span><strong>Zobraziť označenie Aktualizované</strong><small>Pri titulku sa zobrazí zvolený dátum aktualizácie.</small></span></label>
        </section>

        <section id="article-authors" hidden={activeArticleSection !== "article-authors"} tabIndex={activeArticleSection === "article-authors" ? -1 : undefined} data-editor-section-active={activeArticleSection === "article-authors" ? "true" : "false"} data-admin-editor-section className="admin-form-card">
          <div className="admin-card-heading">
            <div><span>02</span><div><h2>Autor</h2><p>Vyber profil autora alebo zachovaj legacy meno pri staršom článku.</p></div></div>
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

        <section id="article-settings" hidden={activeArticleSection !== "article-settings"} tabIndex={activeArticleSection === "article-settings" ? -1 : undefined} data-editor-section-active={activeArticleSection === "article-settings" ? "true" : "false"} data-admin-editor-section className="admin-form-card">
          <div className="admin-card-heading">
            <div><span>03</span><div><h2>Nastavenia</h2><p>Sekcia, kategória a adresa článku.</p></div></div>
          </div>
          <div className="admin-field-grid">
            <div className="admin-field">
              <label htmlFor="article-portal-section">Sekcia portálu</label>
              <select id="article-portal-section" value={portalSection} onChange={(event) => changePortalSection(event.target.value as ArticlePortalSection)}>
                {sectionOptions.map((option) => <option value={option.slug} key={option.slug}>{option.label}</option>)}
              </select>
              <small>Určí, kde sa článok zobrazí a akú bude mať adresu.</small>
            </div>
            {portalSection === "clanky" && (
              <div className="admin-field">
                <label htmlFor="article-category">Kategória článku</label>
                <select id="article-category" value={category} onChange={(event) => setCategory(event.target.value as ManagedArticle["category"])}>
                  <option>Výcvik</option><option>Zdravie</option><option>Výživa</option><option>Život so psom</option><option>Plemená</option>
                </select>
                {category === "Plemená" && <small>Článok sa zobrazí v atlase Plemená. V záložke Prepojené plemená priraď konkrétne plemeno; URL zostáva /clanky/…</small>}
              </div>
            )}
            <AdminArticleTopicPicker
              topics={topicOptions}
              value={topicIds}
              onChange={(ids) => { setTopicIds(ids); setEditorDirty(true); }}
            />
            {portalSection !== "novinky" && portalSection !== "clanky" && (currentAreas.length > 0 || originalAreaHidden) && (
              <div className="admin-field">
                <label htmlFor="article-portal-area">Oblasť {managedSections.find((section) => section.slug === portalSection)?.label ?? "sekcie"}</label>
                <select id="article-portal-area" value={portalSubpage} onChange={(event) => setPortalSubpage(event.target.value)} required>
                  <option value="">Vyber oblasť…</option>
                  {originalAreaHidden && <option value={article?.portalSubpage}>{`Pôvodná oblasť (${article?.portalSubpage})`}</option>}
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
            <div className="admin-field admin-field--full">
              <small role="status">
                Umiestnenie: {portalSectionLabel(portalSection)} → {portalSection === "novinky"
                  ? getNewsCategory(newsCategory)?.label ?? "Vyber typ novinky"
                  : currentAreas.find((item) => item.slug === portalSubpage)?.label
                    ?? (portalSection === "clanky" ? category : portalSubpage ? "Pôvodná oblasť" : "Vyber oblasť")}
              </small>
              <small>Adresa: /{portalSection}/{slug || "adresa-clanku"}</small>
              {article && article.portalSection !== portalSection && (
                <small>Upozornenie: zmena sekcie mení adresu článku. Over presmerovanie pôvodnej URL.</small>
              )}
            </div>
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

<section id="article-seo" hidden={activeArticleSection !== "article-seo"} tabIndex={activeArticleSection === "article-seo" ? -1 : undefined} data-editor-section-active={activeArticleSection === "article-seo" ? "true" : "false"} data-admin-editor-section data-admin-editor-tool="seo" className="admin-form-card">
          <div className="admin-card-heading"><div><span>04</span><div><h2>SEO a zdieľanie</h2><p>Ak pole necháš prázdne, použije sa názov, perex alebo titulná fotografia článku.</p></div></div></div>
          <div className="admin-field-grid">
            <div className="admin-field"><label htmlFor="article-seo-title">SEO title</label><input id="article-seo-title" value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} placeholder={title || "Názov pre vyhľadávače"} /><small>{seoTitle.length} znakov · odporúčame do 60</small></div>
            <div className="admin-field"><label htmlFor="article-focus-keyword">Hlavné kľúčové slovo alebo fráza</label><input id="article-focus-keyword" value={focusKeyword} onChange={(event) => setFocusKeyword(event.target.value)} placeholder="napríklad výživa labradora" /></div>
            <div className="admin-field admin-field--full"><label htmlFor="article-meta-description">Meta description</label><textarea id="article-meta-description" rows={3} value={metaDescription} onChange={(event) => setMetaDescription(event.target.value)} placeholder={excerpt || "Krátky popis pre výsledky vyhľadávania"} /><small>{metaDescription.length} znakov · odporúčame 120–160</small></div>
          </div>
          <details className={editorStyles.editorDisclosure} data-article-seo-advanced>
            <summary>Pokročilé SEO a zdieľanie <span>Canonical URL · Open Graph · Indexovanie</span></summary>
          <div className="admin-field-grid">
            <div className="admin-field admin-field--full"><label htmlFor="article-canonical-url">Canonical URL</label><input id="article-canonical-url" type="url" value={canonicalUrl} onChange={(event) => setCanonicalUrl(event.target.value)} placeholder={`https://psipedia.sk/${portalSection === "clanky" ? "clanky" : portalSection}/${slug || "adresa-clanku"}`} /></div>
            <div className="admin-field"><label htmlFor="article-og-title">Open Graph titulok</label><input id="article-og-title" value={ogTitle} onChange={(event) => setOgTitle(event.target.value)} placeholder={seoTitle || title || "Titulok pri zdieľaní"} /></div>
            <div className="admin-field"><label htmlFor="article-og-description">Open Graph popis</label><textarea id="article-og-description" rows={3} value={ogDescription} onChange={(event) => setOgDescription(event.target.value)} placeholder={metaDescription || excerpt || "Popis pri zdieľaní"} /></div>
          </div>
          <div className="admin-upload-row admin-og-upload">
            <div className={`admin-upload-preview admin-upload-preview--${accent}`}>{ogImageUrl ? <img src={ogImageUrl} alt="Náhľad Open Graph obrázka" loading="lazy" decoding="async" srcSet={responsiveMediaSrcSet(ogImageUrl, [320, 480, 640])} sizes="(max-width: 680px) 92vw, 480px" /> : <span>OG</span>}</div>
            <div className="admin-upload-actions"><strong>Open Graph obrázok</strong><AdminSingleImageUpload label={ogImageUrl ? "Vybrať iný obrázok" : "Nahrať obrázok"} onFile={uploadOgImage} busy={uploading} onRejected={setError}/>{ogImageUrl && <button type="button" onClick={() => { setOgImageUrl(""); setOgImageKey(""); setEditorDirty(true); }}>Odstrániť obrázok</button>}<small>Odporúčaný pomer 1,91 : 1, napríklad 1200 × 630 px.</small></div>
          </div>
          <label className="admin-check"><input type="checkbox" checked={noindex} onChange={(event) => setNoindex(event.target.checked)} /><span><strong>Neindexovať článok (noindex)</strong><small>Článok zostane dostupný cez URL, ale vyhľadávače ho nemajú zaradiť.</small></span></label>
          </details>
        </section>

        <section id="article-relations" hidden={activeArticleSection !== "article-relations"} tabIndex={activeArticleSection === "article-relations" ? -1 : undefined} data-editor-section-active={activeArticleSection === "article-relations" ? "true" : "false"} data-admin-editor-section className="admin-form-card">
          <div className="admin-card-heading"><div><span>05</span><div><h2>Prepojené plemená</h2><p>Článok sa zobrazí v časti „Prehĺbte si vedomosti“ iba pri vybraných plemenách.</p></div></div></div>
          <div className={editorStyles.breedSearchBar}>
            <label htmlFor="article-breed-search">Hľadať plemeno</label>
            <input id="article-breed-search" type="search" value={breedSearch}
              placeholder="Hľadať plemeno (názov alebo FCI číslo)…"
              onFocus={() => setBreedPickerOpen(true)}
              onChange={(event) => { setBreedSearch(event.target.value); setBreedPickerOpen(true); setBreedVisibleLimit(12); }} />
            <small>{relatedBreedIds.length} vybraných · {matchingBreeds.length} výsledkov</small>
          </div>
          {selectedBreeds.length > 0 && (
            <div className={editorStyles.selectedBreedTags} role="group" aria-label="Vybrané plemená">
              {selectedBreeds.map((item) => (
                <button type="button" key={item.id}
                  aria-label={`Odstrániť prepojenie: ${item.name}`}
                  onClick={() => {
                    setRelatedBreedIds((current) => current.filter((id) => id !== item.id));
                    setEditorDirty(true);
                  }}>
                  <span>{item.name}{item.fciNumber ? ` (FCI ${item.fciNumber})` : ""}</span>
                  <X aria-hidden="true" size={14} />
                </button>
              ))}
            </div>
          )}
          {!breedPickerOpen && (
            <button type="button" className={editorStyles.breedPickerToggle}
              onClick={() => setBreedPickerOpen(true)}>Vybrať z dostupných plemien</button>
          )}
          {breedPickerOpen && (
            <div className={editorStyles.breedPickerResults}>
              <div className={editorStyles.breedPickerHeader}>
                <strong>Vybrať plemená</strong>
                <button type="button" onClick={() => { setBreedPickerOpen(false); setBreedSearch(""); }}>
                  Skryť výber
                </button>
              </div>
              <div className={editorStyles.breedList} aria-label="Dostupné plemená">
                {visibleBreeds.map((item) => <label className={editorStyles.breedRow} key={item.id}>
                  <input type="checkbox" checked={relatedBreedIds.includes(item.id)}
                    onChange={() => {
                      setRelatedBreedIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]);
                      setEditorDirty(true);
                    }} />
                  <span className={editorStyles.breedName}>{item.name}</span>
                  {item.fciNumber ? <small>FCI {item.fciNumber}</small> : null}
                </label>)}
                {!matchingBreeds.length && <p role="status">Žiadne plemená nezodpovedajú vyhľadávaniu.</p>}
              </div>
              {unselectedBreeds.length > breedVisibleLimit && <button type="button" className={editorStyles.breedMore}
                onClick={() => setBreedVisibleLimit((value) => value + 24)}>
                Zobraziť ďalšie plemená ({unselectedBreeds.length - breedVisibleLimit})
              </button>}
            </div>
          )}
        </section>

        <section id="article-media" hidden={activeArticleSection !== "article-media"} tabIndex={activeArticleSection === "article-media" ? -1 : undefined} data-editor-section-active={activeArticleSection === "article-media" ? "true" : "false"} data-admin-editor-section className="admin-form-card">
          <div className="admin-card-heading">
            <div><span>06</span><div><h2>Fotografie</h2><p>JPG, PNG, WebP alebo AVIF, najviac 8 MB.</p></div></div>
          </div>
          <div className="admin-upload-row">
            <div className={`admin-upload-preview admin-upload-preview--${accent}`}>
              {imageUrl ? <img src={imageUrl} alt="Náhľad titulnej fotografie" loading="lazy" decoding="async" srcSet={responsiveMediaSrcSet(imageUrl, [320, 480, 640])} sizes="(max-width: 680px) 92vw, 480px" /> : <span>🐕</span>}
            </div>
            <div className="admin-upload-actions">
              <AdminSingleImageUpload label={imageUrl ? "Vybrať inú fotku" : "Nahrať fotku"} onFile={uploadImage} busy={uploading} onRejected={setError}/>
              {imageUrl && <button type="button" onClick={() => {
                setImageUrl("");
                setImageKey("");
                setThumbnailImageDisplay(null);
                setDetailImageDisplay(null);
                setImageAlt("");
                setImageCaption("");
                setImageCredit("");
                setImageCreditUrl("");
                setEditorDirty(true);
              }}>Odstrániť fotku</button>}
              <small>Odporúčaný pomer 16 : 9 a šírka aspoň 1200 px.</small>
            </div>
          </div>
          {imageUrl && <div className="admin-field" data-article-image-presentation>
            <button type="button" className="admin-secondary-button" onClick={() => setImageEditorOpen(true)}>Upraviť zobrazenie</button>
            <small>Náhľadové karty a detail článku majú nezávislé nastavenia.</small>
          </div>}
          <div className="admin-field-grid">
            <div className="admin-field admin-field--full">
              <label htmlFor="article-image-alt">ALT text</label>
              <input id="article-image-alt" value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} placeholder="Stručne opíš, čo je na fotografii." />
              <small>ALT slúži čítačkám obrazovky a SEO. Nie je to popis ani kredit fotografie.</small>
            </div>
            <div className="admin-field admin-field--full">
              <label htmlFor="article-image-caption">Popis fotografie / Caption</label>
              <textarea id="article-image-caption" rows={2} value={imageCaption} onChange={(event) => setImageCaption(event.target.value)} placeholder="Voliteľný viditeľný popis pod fotografiou." />
            </div>
            <div className="admin-field">
              <label htmlFor="article-image-credit">Zdroj / autor fotografie</label>
              <input id="article-image-credit" value={imageCredit} onChange={(event) => setImageCredit(event.target.value)} placeholder="Napríklad Jane Smith / Unsplash" />
            </div>
            <div className="admin-field">
              <label htmlFor="article-image-credit-url">URL zdroja fotografie</label>
              <input id="article-image-credit-url" type="url" value={imageCreditUrl} onChange={(event) => setImageCreditUrl(event.target.value)} placeholder="https://…" />
              <small>Voliteľný odkaz na autora alebo zdroj fotografie.</small>
            </div>
          </div>
        </section>

        <section id="article-basics" hidden={activeArticleSection !== "article-blocks"} tabIndex={-1} data-editor-section-active={activeArticleSection === "article-blocks" ? "true" : "false"} data-admin-editor-section className={`admin-form-card admin-form-card--intro ${editorStyles.introCard}`}>
          <div className="admin-card-heading"><div><span>07</span><div><h2>Názov a perex</h2><p>Základné údaje článku pred súvislým dokumentom.</p></div></div></div>
          <div className="admin-field admin-field--title">
            <label htmlFor="article-title">Názov {portalSection === "novinky" ? "novinky" : "článku"}</label>
            <input id="article-title" value={title} onChange={(event) => changeTitle(event.target.value)} placeholder="Napríklad: Ako naučiť psa pokojne čakať" required />
          </div>
          <div className="admin-field">
            <label htmlFor="article-excerpt">Krátky úvod na karte</label>
            <AdminLexicalTextField id="article-excerpt" rows={3} value={excerpt} onChange={(next) => { setExcerpt(next); setEditorDirty(true); }} placeholder="Jednou až dvomi vetami vysvetli, čo čitateľ v článku nájde." required ariaLabel="Krátky úvod na karte" />
            <small>{excerpt.length} znakov · odporúčame 90–180</small>
          </div>
        </section>

        <section id="article-blocks" hidden={activeArticleSection !== "article-blocks"} tabIndex={activeArticleSection === "article-blocks" ? -1 : undefined} data-editor-section-active={activeArticleSection === "article-blocks" ? "true" : "false"} data-admin-editor-section className="admin-form-card">
          <div className="admin-card-heading">
            <div><span>08</span><div><h2>Editor článku</h2><p>Píš text priamo ako jeden dokument. Ostatné prvky upravuj na ich mieste.</p></div></div>
          </div>
          <AdminArticleContinuousEditor
            intro={intro}
            introRichText={introRichText}
            takeawayRichText={takeawayRichText}
            takeaway={takeaway}
            blocks={blocks}
            promoUtcDay={promoUtcDay}
            currentArticleId={article?.id}
            onUploadingChange={setUploading}
            onMessage={setMessage}
            onError={setError}
            onChange={(fields) => {
              setIntro(fields.intro);
              setIntroRichText(fields.introRichText);
              setTakeaway(fields.takeaway);
              setTakeawayRichText(fields.takeawayRichText);
              setBlocks(fields.blocks);
              setEditorDirty(true);
            }}
          />
        </section>



      
      </form>
      </AdminTiptapArticleScope>
      </EditorWorkspace>
      </div>

      {fullscreenPreviewOpen && <AdminArticleFullscreenPreview
        open={fullscreenPreviewOpen}
        onClose={() => setFullscreenPreviewOpen(false)}
        sectionLabel={portalSectionLabel(portalSection)}
        category={portalSection === "novinky" ? getNewsCategory(newsCategory)?.shortLabel ?? "" : category}
        title={title}
        excerpt={excerpt}
        imageUrl={imageUrl}
        imageAlt={imageAlt}
        imageCaption={imageCaption}
        imageCredit={imageCredit}
        imageConfig={detailImageDisplay}
        introRichText={introRichText}
        takeawayRichText={takeawayRichText}
        takeaway={takeaway}
        blocks={blocks}
        promoUtcDay={promoUtcDay}
      />}
{imageEditorOpen && imageUrl && <ImageDisplayEditor
        src={imageUrl} alt={imageAlt || title} title={title} excerpt={excerpt}
        thumbnail={thumbnailImageDisplay} detail={detailImageDisplay}
        onCancel={() => setImageEditorOpen(false)}
        onSave={(nextThumbnail, nextDetail) => {
          setThumbnailImageDisplay(nextThumbnail);
          setDetailImageDisplay(nextDetail);
          setImageEditorOpen(false);
          setEditorDirty(true);
        }}
      />}
    </>
  );
}
