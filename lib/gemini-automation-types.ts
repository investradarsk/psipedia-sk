/** Gemini-specific contracts. Never import legacy automation source contracts here. */
export type GeminiFailureCode =
  | "CONFIG_MISSING" | "AUTH_FAILED" | "RATE_LIMITED" | "TIMEOUT"
  | "PROVIDER_ERROR" | "INVALID_RESPONSE";

export class GeminiAutomationError extends Error {
  readonly code: GeminiFailureCode;
  readonly httpStatus?: number;
  /** Bounded count only; never carries query text or response data. */
  readonly groundedSearchQueryCount?: number;
  constructor(code: GeminiFailureCode, httpStatus?: number, groundedSearchQueryCount?: number) {
    super(code);
    this.name = "GeminiAutomationError";
    this.code = code;
    this.httpStatus = httpStatus;
    if (code === "INVALID_RESPONSE" && Number.isInteger(groundedSearchQueryCount) &&
      groundedSearchQueryCount! >= 0 && groundedSearchQueryCount! <= 100) {
      this.groundedSearchQueryCount = groundedSearchQueryCount;
    }
  }
}

export type GeminiRuntimeConfig = {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
};

export type GeminiRunStatus = "RUNNING" | "SUCCESS" | "FAILED";
