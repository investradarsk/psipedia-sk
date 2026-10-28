import { env } from "cloudflare:workers";
import { getManagedArticleById, type ManagedArticle } from "@/lib/article-store";
import { articleHref } from "@/lib/portal";
import { facebookScheduleInstant, type FacebookImagePost } from "@/lib/facebook-image-post";
import { facebookImageDb, getFacebookImagePost, saveFacebookImagePost } from "@/lib/facebook-image-store";
import { setIndividualApproval } from "@/lib/facebook-image-publisher";

type ArticleImageMode = "photo" | "graphic";
type ArticleScheduleInput = {
  enabled: boolean;
  date: string;
  time: string;
  repeatedHour?: string;
  imageMode: ArticleImageMode;
  graphicImageKey?: string;
  includeLink: boolean;
  approve: boolean;
  expectedVersion?: number;
};

const facebookKey = /^facebook-images\/\d{4}\/[a-f0-9-]+\.(?:jpg|png|webp)$/;

export function facebookArticleCaption(article: Pick<ManagedArticle, "socialCaption" | "excerpt" | "slug" | "portalSection">, includeLink: boolean) {
  const content = (article.socialCaption || article.excerpt).trim();
  const link = `https://psipedia.sk${articleHref(article)}`;
  return includeLink ? `${content}\n\nCelý článok: ${link}`.trim() : content;
}

export async function linkedFacebookArticlePost(articleId: number, db: D1Database = facebookImageDb()) {
  const row = await db.prepare(
    "SELECT id FROM facebook_image_posts WHERE article_id=? LIMIT 1",
  ).bind(articleId).first<{ id: string }>();
  return row ? getFacebookImagePost(row.id, db) : null;
}

function parseInput(value: unknown): ArticleScheduleInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Neplatné nastavenie Facebook článku.");
  const row = value as Record<string, unknown>;
  const keys = new Set(["enabled", "date", "time", "repeatedHour", "imageMode", "graphicImageKey", "includeLink", "approve", "expectedVersion"]);
  if (Object.keys(row).some(key => !keys.has(key))) throw new Error("Neznáme nastavenie Facebook článku.");
  if (typeof row.enabled !== "boolean" || typeof row.includeLink !== "boolean" || typeof row.approve !== "boolean") {
    throw new Error("Neplatné nastavenie povolenia publikovania.");
  }
  if (row.imageMode !== "photo" && row.imageMode !== "graphic") throw new Error("Vyber spôsob publikovania obrázka.");
  for (const key of ["date", "time", "repeatedHour", "graphicImageKey"]) {
    if (row[key] !== undefined && typeof row[key] !== "string") throw new Error("Neplatné pole " + key + ".");
  }
  if (row.expectedVersion !== undefined && (!Number.isSafeInteger(row.expectedVersion) || Number(row.expectedVersion) < 1)) {
    throw new Error("Neplatná verzia Facebook príspevku.");
  }
  return {
    enabled: row.enabled,
    date: (row.date as string | undefined) ?? "",
    time: (row.time as string | undefined) ?? "",
    repeatedHour: (row.repeatedHour as string | undefined) ?? "",
    imageMode: row.imageMode,
    graphicImageKey: (row.graphicImageKey as string | undefined) ?? "",
    includeLink: row.includeLink,
    approve: row.approve,
    expectedVersion: row.expectedVersion as number | undefined,
  };
}

type SocialR2 = { BUCKET?: R2Bucket };

async function copyArticlePhoto(article: ManagedArticle, previous: FacebookImagePost | null) {
  const bucket = (env as unknown as SocialR2).BUCKET;
  if (!bucket || !article.imageKey) throw new Error("Na Facebook treba titulný obrázok uložený v Psipedii.");
  if (previous?.articleImageMode === "photo" && previous.imageKey) {
    const head = await bucket.head(previous.imageKey);
    if (head?.customMetadata?.facebookArticleSource === article.imageKey) {
      return { imageKey: previous.imageKey, imageUrl: previous.imageUrl };
    }
  }
  const original = await bucket.get(article.imageKey);
  if (!original) throw new Error("Titulná fotografia článku sa nenašla v úložisku.");
  const mime = original.httpMetadata?.contentType;
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/jpeg" ? "jpg" : null;
  if (!ext) throw new Error("Titulná fotografia musí byť JPG, PNG alebo WebP.");
  const key = `facebook-images/${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${ext}`;
  await bucket.put(key, original.body, {
    httpMetadata: { contentType: mime },
    customMetadata: { facebookArticleSource: article.imageKey },
  });
  return { imageKey: key, imageUrl: `/media/${key}` };
}

/**
 * Uses the existing photo publisher, its STOP switch, approval ledger, retry
 * semantics and calendar. Never creates a parallel publishing queue.
 */
export async function saveFacebookArticleSchedule(articleId: number, raw: unknown, actor: string, db: D1Database = facebookImageDb()) {
  const input = parseInput(raw);
  const article = await getManagedArticleById(articleId);
  if (!article) throw new Error("Článok sa nenašiel.");
  const existing = await linkedFacebookArticlePost(articleId, db);
  if (existing?.status === "published" || existing?.publicationState === "SENDING" || existing?.publicationState === "UNCERTAIN") {
    throw new Error("Odoslaný alebo neistý Facebook príspevok nie je možné prepísať.");
  }
  if (existing && input.expectedVersion !== existing.version) {
    throw new Error("Facebook príspevok sa medzičasom zmenil. Obnov editor.");
  }
  if (!input.enabled && !existing) return null;

  let scheduledAt: string | null = null;
  if (input.enabled) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) {
      throw new Error("Zadaj dátum a čas publikovania na Facebooku.");
    }
    scheduledAt = facebookScheduleInstant(input.date, input.time, input.repeatedHour);
    if (Date.parse(scheduledAt) <= Date.now()) throw new Error("Facebook príspevok musí byť naplánovaný do budúcnosti.");
    if (article.status === "draft" || !article.publishedAt ||
        Date.parse(article.publishedAt) > Date.parse(scheduledAt)) {
      throw new Error("Najprv publikuj článok alebo nastav skorší dátum publikovania na webe.");
    }
  }

  let imageKey = existing?.imageKey ?? "";
  let imageUrl = existing?.imageUrl ?? "";
  if (input.enabled && input.imageMode === "photo") {
    ({ imageKey, imageUrl } = await copyArticlePhoto(article, existing));
  } else if (input.enabled && input.imageMode === "graphic") {
    if (!facebookKey.test(input.graphicImageKey ?? "")) {
      throw new Error("Najprv vytvor a ulož grafiku s nadpisom článku.");
    }
    imageKey = input.graphicImageKey!;
    imageUrl = `/media/${imageKey}`;
  }
  const post = await saveFacebookImagePost(existing?.id ?? null, {
    title: article.title.slice(0, 200),
    imageKey, imageUrl,
    caption: facebookArticleCaption(article, input.includeLink),
    date: input.enabled ? input.date : "",
    time: input.enabled ? input.time : "",
    repeatedHour: input.enabled ? input.repeatedHour : "",
    status: input.enabled ? "scheduled" : "draft",
    ...(existing ? { expectedVersion: input.expectedVersion } : {}),
  }, actor, db, articleId, { imageMode: input.imageMode, includeLink: input.includeLink });

  if (input.enabled && input.approve) {
    const result = await setIndividualApproval(db, post.id, post.version, true, actor);
    if (!result) throw new Error("Naplánovanie sa uložilo, ale schválenie sa nepodarilo. Skontroluj kalendár.");
    return getFacebookImagePost(post.id, db);
  }
  return post;
}
