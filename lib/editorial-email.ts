import { env } from "cloudflare:workers";
import { directoryCategoryLabel, type DirectoryInquiry, type DirectoryProfileChangeRequest } from "@/lib/directory";
import { newsTipTopicLabel, type NewsTip } from "@/lib/news-tip";
import type { ArticleFeedback } from "@/lib/article-feedback-store";
import { EDITORIAL_EMAIL_ADDRESS } from "@/lib/public-contact";

const ADMIN_ORIGIN = "https://psipedia.sk";

type EmailSendBinding = {
  send(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<unknown>;
};

type RuntimeBindings = {
  EDITORIAL_EMAIL?: EmailSendBinding;
  EDITORIAL_FROM_EMAIL?: string;
};

type EditorialMessage = {
  subject: string;
  lines: Array<string | null | undefined | false>;
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

/**
 * Best-effort notification only. The caller's primary D1 operation has already
 * succeeded, so this helper deliberately absorbs binding and delivery errors.
 */
export async function sendEditorialEmail(message: EditorialMessage) {
  const bindings = env as unknown as RuntimeBindings;
  const sender = bindings.EDITORIAL_FROM_EMAIL?.trim();
  if (!bindings.EDITORIAL_EMAIL || typeof bindings.EDITORIAL_EMAIL.send !== "function") {
    console.warn("Editorial email skipped: EDITORIAL_EMAIL binding is unavailable.");
    return false;
  }
  if (!sender) {
    console.warn("Editorial email skipped: EDITORIAL_FROM_EMAIL is not configured.");
    return false;
  }

  try {
    await bindings.EDITORIAL_EMAIL.send({
      from: sender,
      to: EDITORIAL_EMAIL_ADDRESS,
      subject: message.subject.replace(/[\r\n]+/g, " ").slice(0, 240),
      text: message.lines.filter((item): item is string => typeof item === "string" && item.length > 0).join("\n"),
    });
    return true;
  } catch (error) {
    console.error("Editorial email notification failed.", error);
    return false;
  }
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

export function notifyDirectoryInquiry(inquiry: DirectoryInquiry) {
  return sendEditorialEmail({
    subject: `[Dopyt] ${inquiry.profileName}`,
    lines: [
      line("Profil", inquiry.profileName),
      line("Kategória", directoryCategoryLabel(inquiry.profileCategory)),
      line("Meno", inquiry.senderName),
      line("E-mail", inquiry.senderEmail),
      line("Telefón", inquiry.senderPhone),
      line("Informácie o psovi", inquiry.dogInfo),
      line("Správa", inquiry.message),
      line("Dátum", formatDate(inquiry.createdAt)),
      line("Admin", `${ADMIN_ORIGIN}/admin/dopyty#dopyt-${inquiry.id}`),
    ],
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

