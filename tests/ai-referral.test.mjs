import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  classifyAiReferralHostname,
  classifyAiReferralReferrer,
} from "../lib/ai-referral.ts";

test("classifies known AI referral hostnames", () => {
  assert.equal(classifyAiReferralHostname("chatgpt.com"), "chatgpt");
  assert.equal(classifyAiReferralHostname("chat.openai.com"), "chatgpt");
  assert.equal(classifyAiReferralHostname("claude.ai"), "claude");
  assert.equal(classifyAiReferralHostname("gemini.google.com"), "gemini");
  assert.equal(classifyAiReferralHostname("copilot.microsoft.com"), "microsoft_copilot");
  assert.equal(classifyAiReferralHostname("perplexity.ai"), "perplexity");
});

test("accepts real subdomains of known AI referral hostnames", () => {
  assert.equal(classifyAiReferralHostname("www.chatgpt.com"), "chatgpt");
  assert.equal(classifyAiReferralHostname("foo.claude.ai"), "claude");
  assert.equal(classifyAiReferralHostname("share.gemini.google.com"), "gemini");
  assert.equal(classifyAiReferralHostname("www.copilot.microsoft.com"), "microsoft_copilot");
  assert.equal(classifyAiReferralHostname("www.perplexity.ai."), "perplexity");
});

test("rejects spoofed hostnames that only contain an AI hostname", () => {
  assert.equal(classifyAiReferralHostname("chatgpt.com.evil.example"), null);
  assert.equal(classifyAiReferralHostname("fakeclaude.ai"), null);
  assert.equal(classifyAiReferralHostname("gemini.google.com.evil.example"), null);
  assert.equal(classifyAiReferralHostname("copilot.microsoft.com.attacker.test"), null);
  assert.equal(classifyAiReferralHostname("perplexity.ai.example"), null);
});

test("does not classify normal Google or Facebook referrals as AI", () => {
  assert.equal(classifyAiReferralHostname("google.com"), null);
  assert.equal(classifyAiReferralHostname("www.google.com"), null);
  assert.equal(classifyAiReferralHostname("facebook.com"), null);
  assert.equal(classifyAiReferralHostname("l.facebook.com"), null);
});

test("handles direct, invalid and non-web referrers", () => {
  assert.equal(classifyAiReferralReferrer(""), null);
  assert.equal(classifyAiReferralReferrer(null), null);
  assert.equal(classifyAiReferralReferrer("not a url"), null);
  assert.equal(classifyAiReferralReferrer("mailto:test@example.com"), null);
});

test("classifies full AI referrer URLs without using paths as identity", () => {
  assert.equal(classifyAiReferralReferrer("https://chatgpt.com/c/example"), "chatgpt");
  assert.equal(classifyAiReferralReferrer("https://chat.openai.com/share/example"), "chatgpt");
  assert.equal(classifyAiReferralReferrer("https://gemini.google.com/app/example"), "gemini");
  assert.equal(classifyAiReferralReferrer("https://www.google.com/search?q=psipedia"), null);
});

test("GA4 integration emits a normalized AI referral visit event through the existing consent layer", async () => {
  const consent = await readFile(new URL("../components/cookie-consent.tsx", import.meta.url), "utf8");

  assert.match(consent, /classifyAiReferralReferrer/);
  assert.match(consent, /"ai_referral_visit"/);
  assert.match(consent, /ai_referral_source:/);
  assert.match(consent, /psipediaGa4AiReferralTracked/);
  assert.match(consent, /await loadAnalytics\(\)/);
});
