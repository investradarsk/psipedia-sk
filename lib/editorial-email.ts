import { env } from "cloudflare:workers";
import { directoryCategoryLabel, type DirectoryInquiry, type DirectoryProfileChangeRequest } from "@/lib/directory";
import { newsTipTopicLabel, type NewsTip } from "@/lib/news-tip";
import type { ArticleFeedback } from "@/lib/article-feedback-store";
import { EDITORIAL_EMAIL_ADDRESS } from "@/lib/public-contact";

const ADMIN_ORIGIN = "https://psipedia.sk";
const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 8_000;
const INQUIRY_PREVIEW_LENGTH = 260;

export type EditorialEmailBindings = {
  RESEND_API_KEY?: string;
  EDITORIAL_FROM_EMAIL?: string;
};

export type EditorialEmailDeliveryResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string };

export type DirectoryInquiryNotificationType = "new" | "stale-24h";

type EditorialMessage = {
  subject: string;
  lines: Array<string | null | undefined | false>;
  html?: string;
};

type EditorialEmailOptions = {
  bindings?: EditorialEmailBindings;
  idempotencyKey?: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Bratislava",
  }).format(new Date(value));
}

function line(label: string, value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? `${label}: ${clean}` : null;
}

function safeSubject(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 240);
}

export function escapeEmailHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function directoryInquiryMessagePreview(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > INQUIRY_PREVIEW_LENGTH ? `${clean.slice(0, INQUIRY_PREVIEW_LENGTH - 1)}…` : clean;
}

function directoryInquiryEmailHtml(input: {
  profileName: string;
  category: string;
  senderName: string;
  preview: string;
  adminUrl: string;
}) {
  return [
    "<p>Prišiel nový dopyt cez Psipediu.</p>",
    "<dl>",
    `<dt><strong>Profil</strong></dt><dd>${escapeEmailHtml(input.profileName)}</dd>`,
    `<dt><strong>Kategória</strong></dt><dd>${escapeEmailHtml(input.category)}</dd>`,
    `<dt><strong>Meno</strong></dt><dd>${escapeEmailHtml(input.senderName)}</dd>`,
    `<dt><strong>Náhľad správy</strong></dt><dd>${escapeEmailHtml(input.preview)}</dd>`,
    "</dl>",
    `<p><a href="${escapeEmailHtml(input.adminUrl)}">Otvoriť dopyt v administrácii</a></p>`,
  ].join("");
}

export async function sendEditorialEmailDetailed(message: EditorialMessage, options: EditorialEmailOptions = {}): Promise<EditorialEmailDeliveryResult> {
  const bindings = options.bindings ?? env as unknown as EditorialEmailBindings;
  const apiKey = bindings.RESEND_API_KEY?.trim();
  const sender = bindings.EDITORIAL_FROM_EMAIL?.trim();
  if (!apiKey) return { ok: false, error: "missing_resend_api_key" };
  if (!sender) return { ok: false, error: "missing_editorial_from_email" };

  try {
    const headers: Record<string, string> = {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    };
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

    const response = await fetch(RESEND_EMAIL_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: sender,
        to: EDITORIAL_EMAIL_ADDRESS,
        subject: safeSubject(message.subject),
        text: message.lines.filter((item): item is string => typeof item === "string" && item.length > 0).join("\n"),
        ...(message.html ? { html: message.html } : {}),
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, error: `resend_http_${response.status}` };

    try {
      const result = await response.json() as { id?: unknown };
      return { ok: true, providerMessageId: typeof result.id === "string" ? result.id : null };
    } catch {
      return { ok: true, providerMessageId: null };
    }
  } catch {
    return { ok: false, error: "resend_request_failed" };
  }
}

/**
 * Best-effort notification for legacy editorial flows. Their primary D1
 * operation has already succeeded, so delivery errors are logged and absorbed.
 */
export async function sendEditorialEmail(message: EditorialMessage) {
  const result = await sendEditorialEmailDetailed(message);
  if (!result.ok) {
    console.error(JSON.stringify({
      event: "editorial_email_delivery",
      result: "failed",
      error: result.error,
    }));
  }
  return result.ok;
}

export function notifyDirectoryProfileChangeRequest(request: DirectoryProfileChangeRequest) {
  return sendEditorialEmail({
    subject: `[Návrh profilu] ${request.profileName}`,
    lines: [
      line("Profil", request.profileName),
      line("Kategória", directoryCategoryLabel(request.profileCategory)),
      line("Navrhovateľ", request.requesterName),
      line("E-mail", request.requesterEmail),
      line("Telefón", request.requesterPhone),
      line("Vzťah k službe", request.requesterRole),
      line("Poznámka", request.note),
      line("Dátum", formatDate(request.createdAt)),
      line("Admin", `${ADMIN_ORIGIN}/admin/adresar/navrhy#navrh-${request.id}`),
    ],
  });
}

export function notifyDirectoryInquiry(
  inquiry: DirectoryInquiry,
  notificationType: DirectoryInquiryNotificationType = "new",
  options: { bindings?: EditorialEmailBindings } = {},
) {
  const category = directoryCategoryLabel(inquiry.profileCategory);
  const preview = directoryInquiryMessagePreview(inquiry.message);
  const adminUrl = `${ADMIN_ORIGIN}/admin/dopyty#dopyt-${inquiry.id}`;
  const subject = notificationType === "new"
    ? `Nový dopyt: ${inquiry.profileName}`
    : `Nevybavený dopyt po 24 h: ${inquiry.profileName}`;

  return sendEditorialEmailDetailed({
    subject,
    lines: [
      line("Profil", inquiry.profileName),
      line("Kategória", category),
      line("Meno", inquiry.senderName),
      line("Náhľad správy", preview),
      line("Admin", adminUrl),
    ],
    html: directoryInquiryEmailHtml({
      profileName: inquiry.profileName,
      category,
      senderName: inquiry.senderName,
      preview,
      adminUrl,
    }),
  }, {
    bindings: options.bindings,
    idempotencyKey: `directory-inquiry/${notificationType}/${inquiry.id}`,
  });
}

export function notifyNewsTip(tip: NewsTip) {
  return sendEditorialEmail({
    subject: `[Tip pre redakciu] ${tip.title}`,
    lines: [
      line("Názov", tip.title),
      line("Téma", newsTipTopicLabel(tip.topic)),
      line("Opis", tip.summary),
      line("Zdroj", tip.sourceUrl),
      line("Miesto", tip.location),
      line("Dátum udalosti", tip.eventDate),
      line("Meno", tip.contactName),
      line("Kontaktný e-mail", tip.contactEmail),
      line("Dátum prijatia", formatDate(tip.createdAt)),
      line("Admin", `${ADMIN_ORIGIN}/admin/tipy#tip-${tip.id}`),
    ],
  });
}

export function notifyNegativeArticleFeedback(feedback: ArticleFeedback) {
  if (feedback.helpful) return Promise.resolve(false);
  return sendEditorialEmail({
    subject: `[Podnet k článku] ${feedback.articleTitle}`,
    lines: [
      line("Článok", feedback.articleTitle),
      line("Adresa", `${ADMIN_ORIGIN}${feedback.articlePath}`),
      line("Podnet", feedback.missingText || "Bez doplňujúcej poznámky."),
      line("Dátum", formatDate(feedback.createdAt)),
      line("Admin", `${ADMIN_ORIGIN}/admin/hodnotenia#hodnotenie-${feedback.id}`),
    ],
  });
}
