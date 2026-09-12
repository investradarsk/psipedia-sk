import { env } from "cloudflare:workers";

type SubmissionFeatureEnv = {
  LOST_FOUND_SUBMISSIONS_ENABLED?: string;
  ADOPTION_SUBMISSIONS_ENABLED?: string;
  ORGANIZATION_SUBMISSIONS_ENABLED?: string;
};

function enabled(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

export function submissionFeatureFlags() {
  const runtime = env as unknown as SubmissionFeatureEnv;
  return Object.freeze({
    lostFound: enabled(runtime.LOST_FOUND_SUBMISSIONS_ENABLED),
    adoption: enabled(runtime.ADOPTION_SUBMISSIONS_ENABLED),
    organization: enabled(runtime.ORGANIZATION_SUBMISSIONS_ENABLED),
  });
}
