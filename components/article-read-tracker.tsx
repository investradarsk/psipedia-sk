"use client";

import { useEffect } from "react";
import { hasQualifiedAnalyticsConsent, QUALIFIED_ANALYTICS_CONSENT_EVENT } from "@/lib/qualified-analytics-consent";
import {
  ARTICLE_READ_QUALIFY_MS,
  articleReadIsCoolingDown,
  createArticleReadClock,
  currentArticleVisibleMs,
  isInternalArticleReadBrowser,
  markArticleReadCooldown,
  sendQualifiedArticleRead,
  updateArticleReadClock,
} from "@/lib/article-read-tracking";

export function ArticleReadTracker({ articleSlug }: { articleSlug: string }) {
  useEffect(() => {
    let disposed = false;
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let clock = createArticleReadClock(performance.now(), document.visibilityState === "visible");

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const qualify = () => {
      if (disposed || finished || !clock.qualified) return;
      // Consent can arrive after 10 seconds; the existing clock stays
      // qualified, but no analytics state is written until consent is granted.
      if (!hasQualifiedAnalyticsConsent(window.localStorage)) return;
      finished = true;
      clearTimer();

      if (isInternalArticleReadBrowser(window.localStorage, window.location.search)) return;

      const nowMs = Date.now();
      if (articleReadIsCoolingDown(window.localStorage, articleSlug, nowMs)) return;

      // Mark before the best-effort request so refresh/navigation cannot fan out duplicates.
      markArticleReadCooldown(window.localStorage, articleSlug, nowMs);
      void sendQualifiedArticleRead(articleSlug);
    };

    const schedule = () => {
      clearTimer();
      if (disposed || finished || document.visibilityState !== "visible") return;
      const remaining = Math.max(
        0,
        ARTICLE_READ_QUALIFY_MS - currentArticleVisibleMs(clock, performance.now()),
      );
      timer = setTimeout(() => {
        clock = updateArticleReadClock(clock, performance.now(), true);
        if (clock.qualified) qualify();
        else schedule();
      }, remaining);
    };

    const syncVisibility = () => {
      const visible = document.visibilityState === "visible";
      clock = updateArticleReadClock(clock, performance.now(), visible);
      if (clock.qualified) qualify();
      else schedule();
    };

    const pageHide = () => {
      clock = updateArticleReadClock(clock, performance.now(), false);
      if (clock.qualified) qualify();
    };

    document.addEventListener("visibilitychange", syncVisibility);
    window.addEventListener("pagehide", pageHide);
    window.addEventListener(QUALIFIED_ANALYTICS_CONSENT_EVENT, qualify);
    schedule();

    return () => {
      disposed = true;
      clearTimer();
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener(QUALIFIED_ANALYTICS_CONSENT_EVENT, qualify);
    };
  }, [articleSlug]);

  return null;
}
