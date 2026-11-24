import { deriveRateLimitKey } from "@/lib/rate-limit";
import { normalizePlainText } from "@/lib/submission-security";
import { ProfileReviewSubmissionError } from "@/lib/profile-review-submission";

export const GUEST_REVIEW_COOKIE = "__Host-psipedia_review_guest";

export async function prepareGuestReviewAuthor(request: Request, displayName: unknown, ownExperience: unknown, hashKey: string) {
  if (ownExperience !== true) {
    throw new ProfileReviewSubmissionError("Potvrďte, že opisujete vlastnú skúsenosť.", 422, "EXPERIENCE_REQUIRED", "ownExperience");
  }
  let name: string;
  try {
    name = normalizePlainText(displayName, { min: 2, max: 60, field: "displayName" });
  } catch {
    throw new ProfileReviewSubmissionError("Zadajte meno alebo prezývku (2 až 60 znakov).", 422, "INVALID_DISPLAY_NAME", "displayName");
  }
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(GUEST_REVIEW_COOKIE + "="))?.slice(GUEST_REVIEW_COOKIE.length + 1);
  const token = cookie && /^[0-9a-f-]{36}$/i.test(cookie) ? cookie : crypto.randomUUID();
  const authorId = await deriveRateLimitKey("guest-review", token, hashKey);
  return {
    authorId,
    guest: { displayName: name },
    cookie: `${GUEST_REVIEW_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000`,
  };
}
