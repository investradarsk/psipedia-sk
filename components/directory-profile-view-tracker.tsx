"use client";

import { useEffect } from "react";
import { hasQualifiedAnalyticsConsent, QUALIFIED_ANALYTICS_CONSENT_EVENT } from "@/lib/qualified-analytics-consent";
import {
  ARTICLE_READ_QUALIFY_MS,
  createArticleReadClock,
  currentArticleVisibleMs,
  isInternalArticleReadBrowser,
  updateArticleReadClock,
} from "@/lib/article-read-tracking";
import {
  reserveQualifiedProfileView,
  sendQualifiedProfileView,
} from "@/lib/profile-view-tracking";

/** Invisible: count a published profile only after 10 seconds of visible reading. */
export function DirectoryProfileViewTracker({
  profileId,
  profileSlug,
}: {
  profileId: number;
  profileSlug: string;
}) {
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
      // Do not create a localStorage token or make a POST before consent.
      // A later opt-in event can qualify this already visible page.
      if (!hasQualifiedAnalyticsConsent(window.localStorage)) return;
      finished = true;
      clearTimer();

      try {
        if (isInternalArticleReadBrowser(window.localStorage, window.location.search)) return;
        const visitToken = reserveQualifiedProfileView(window.localStorage, profileId, Date.now());
        if (visitToken) void sendQualifiedProfileView(profileId, profileSlug, visitToken);
      } catch {
        // Privacy modes can block localStorage. Never break the public profile.
      }
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
      clock = updateArticleReadClock(clock, performance.now(), document.visibilityState === "visible");
      if (clock.qualified) qualify();
      else schedule();
    };

    const onPageHide = () => {
      clock = updateArticleReadClock(clock, performance.now(), false);
      if (clock.qualified) qualify();
    };

    document.addEventListener("visibilitychange", syncVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener(QUALIFIED_ANALYTICS_CONSENT_EVENT, qualify);
    schedule();

    return () => {
      disposed = true;
      clearTimer();
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener(QUALIFIED_ANALYTICS_CONSENT_EVENT, qualify);
    };
  }, [profileId, profileSlug]);

  return null;
}
