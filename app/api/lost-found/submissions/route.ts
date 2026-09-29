import { env } from "cloudflare:workers";
import { cleanupLostFoundPublicMedia, createLostFoundPublicMedia } from "@/lib/lost-found-public-media";
import { ensurePendingLostFoundModeration } from "@/lib/lost-found-public-moderation";
import {
  normalizePublicLostFoundSubmission,
  publicLostFoundHoneypotTriggered,
  publicLostFoundImage,
  PublicLostFoundSubmissionError,
} from "@/lib/lost-found-public-submission";
import {
  createPendingPublicLostFoundDogReport,
  deleteUnpublishedPublicLostFoundDogReport,
  getPublicLostFoundDatabase,
} from "@/lib/lost-found-public-store";
import {
  assertPublicLostFoundMutation,
  enforcePublicLostFoundRateLimits,
  verifyPublicLostFoundTurnstile,
} from "@/lib/lost-found-public-security";
import { lostFoundSubmissionEnabled } from "@/lib/submission-feature-flags";

export const dynamic = "force-dynamic";

type Bindings = {
  DB?: D1Database;
  TURNSTILE_SECRET_KEY?: string;
  PII_HASH_KEY?: string;
};

const MAX_REQUEST_BYTES = 10 * 1024 * 1024;
const SUCCESS_MESSAGE = "Ďakujeme. Hlásenie sme prijali na kontrolu. Verejne sa zobrazí až po schválení.";

function acceptedResponse() {
  return Response.json(
    { success: true, message: SUCCESS_MESSAGE },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}

function required(value: string | undefined) {
  const clean = value?.trim();
  if (!clean) {
    throw new PublicLostFoundSubmissionError(
      "Odoslanie hlásenia momentálne nie je dostupné.",
      503,
      "SECURITY_CONFIGURATION",
    );
  }
  return clean;
}

function publicError(error: unknown) {
  if (!(error instanceof PublicLostFoundSubmissionError)) return null;
  return Response.json(
    { error: error.message, code: error.code, field: error.field },
    {
      status: error.status,
      headers: {
        "Cache-Control": "private, no-store",
        ...(error.status === 429 ? { "Retry-After": "3600" } : {}),
      },
    },
  );
}

function requestId(request: Request) {
  const value = request.headers.get("cf-ray") || request.headers.get("x-request-id") || "";
  return /^[a-zA-Z0-9._:-]{1,120}$/.test(value) ? value : null;
}

export async function POST(request: Request) {
  let reportId: number | null = null;
  let createdReport = false;
  let createdMedia = false;

  try {
    assertPublicLostFoundMutation(request);
    if (!lostFoundSubmissionEnabled()) {
      throw new PublicLostFoundSubmissionError(
        "Verejné nahlasovanie stratených a nájdených psov zatiaľ nie je zapnuté.",
        503,
        "SUBMISSION_DISABLED",
      );
    }

    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      throw new PublicLostFoundSubmissionError("Odoslané údaje sú príliš veľké.", 413, "REQUEST_TOO_LARGE");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new PublicLostFoundSubmissionError("Odoslané údaje nie sú platné.", 400, "INVALID_FORM");
    }

    if (publicLostFoundHoneypotTriggered(form)) {
      return acceptedResponse();
    }

    const submission = normalizePublicLostFoundSubmission(form);
    const runtime = env as unknown as Bindings;
    const database = getPublicLostFoundDatabase(runtime.DB);
    const hashKey = required(runtime.PII_HASH_KEY);
    const turnstileSecret = process.env.PSIPEDIA_E2E_LOCAL_BOOTSTRAP === "1"
      ? ""
      : required(runtime.TURNSTILE_SECRET_KEY);
    const contactIdentity = submission.normalizedEmail || submission.normalizedPhone || "missing-contact";

    await enforcePublicLostFoundRateLimits({
      database,
      request,
      contactIdentity,
      hashKey,
    });

    await verifyPublicLostFoundTurnstile({
      database,
      request,
      token: typeof form.get("turnstileToken") === "string" ? String(form.get("turnstileToken")) : "",
      secret: turnstileSecret,
    });

    const report = await createPendingPublicLostFoundDogReport(submission, { database });
    reportId = report.id;
    createdReport = report.created;

    const image = publicLostFoundImage(form);
    if (image) {
      const media = await createLostFoundPublicMedia({ reportId: report.id, file: image, database });
      createdMedia = media.created;
    }

    await ensurePendingLostFoundModeration({
      reportId: report.id,
      submission,
      hasImage: Boolean(image),
      requestId: requestId(request),
    });

    return acceptedResponse();
  } catch (error) {
    if (createdReport && reportId !== null) {
      if (createdMedia) await cleanupLostFoundPublicMedia(reportId).catch(() => undefined);
      await deleteUnpublishedPublicLostFoundDogReport(reportId).catch(() => undefined);
    }

    const known = publicError(error);
    if (known) return known;

    console.error(JSON.stringify({
      event: "lost_found_public_submission",
      result: "failed",
      error: error instanceof Error ? error.name : "unknown_error",
    }));

    return Response.json(
      { error: "Hlásenie sa momentálne nepodarilo odoslať. Skúste to znova.", code: "SUBMISSION_FAILED", field: null },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
