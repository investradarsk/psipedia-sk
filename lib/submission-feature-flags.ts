import { env } from "cloudflare:workers";
import { configFlagEnabled, validateRuntimeEnvironment } from "../config/runtime-env";

type SubmissionFeatureEnv = {
  LOST_FOUND_SUBMISSIONS_ENABLED?: string;
  ADOPTION_SUBMISSIONS_ENABLED?: string;
  ORGANIZATION_SUBMISSIONS_ENABLED?: string;
  TURNSTILE_SECRET_KEY?: string;
  PII_ENCRYPTION_KEY?: string;
  PII_HASH_KEY?: string;
};

export function submissionFeatureFlags() {
  const runtime = env as unknown as SubmissionFeatureEnv;
  validateRuntimeEnvironment(runtime);
  return Object.freeze({
    lostFound: configFlagEnabled(runtime.LOST_FOUND_SUBMISSIONS_ENABLED),
    adoption: configFlagEnabled(runtime.ADOPTION_SUBMISSIONS_ENABLED),
    organization: configFlagEnabled(runtime.ORGANIZATION_SUBMISSIONS_ENABLED),
  });
}
