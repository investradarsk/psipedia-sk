import { env } from "cloudflare:workers";
import { validateRuntimeEnvironment } from "../config/runtime-env";

type SubmissionFeatureEnv = {
  LOST_FOUND_SUBMISSIONS_ENABLED?: string;
  ADOPTION_SUBMISSIONS_ENABLED?: string;
  ORGANIZATION_SUBMISSIONS_ENABLED?: string;
  TURNSTILE_SECRET_KEY?: string;
  PII_ENCRYPTION_KEY?: string;
  PII_HASH_KEY?: string;
};

function enabled(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

export function submissionFeatureFlags() {
  const runtime = env as unknown as SubmissionFeatureEnv;
  validateRuntimeEnvironment(runtime);
  return Object.freeze({
    lostFound: enabled(runtime.LOST_FOUND_SUBMISSIONS_ENABLED),
    adoption: enabled(runtime.ADOPTION_SUBMISSIONS_ENABLED),
    organization: enabled(runtime.ORGANIZATION_SUBMISSIONS_ENABLED),
  });
}
