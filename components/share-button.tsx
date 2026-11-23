"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { PublicActionButton, PublicActionLink } from "@/components/public-visual-system";
import styles from "./share-button.module.css";
import { ShareIcon } from "./icons";
import utilityStyles from "./public-utility-action.module.css";

export function ShareButton({
  title,
  label = "Zdieľať článok",
  url,
  compact = false,
}: {
  title: string;
  label?: string;
  url?: string;
  compact?: boolean;
}) {
  const resolvedUrl = url?.trim() ?? "";
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copyFeedback =
    copyStatus === "copied"
      ? "Odkaz skopírovaný"
      : copyStatus === "failed"
        ? "Kopírovanie zlyhalo"
        : null;
  useEffect(() => {
    if (copyStatus !== "copied") return;
    const timeout = window.setTimeout(() => setCopyStatus("idle"), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);
  const supportsNativeShare = useSyncExternalStore(
    () => () => {},
    () => typeof navigator.share === "function",
    () => false,
  );

  const shareTargets = useMemo(() => {
    const encodedUrl = encodeURIComponent(resolvedUrl);
    const encodedText = encodeURIComponent(`${title} ${resolvedUrl}`);
    return {
      facebook: resolvedUrl ? `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` : "#",
      whatsapp: resolvedUrl ? `https://wa.me/?text=${encodedText}` : "#",
    };
  }, [resolvedUrl, title]);

  function currentShareUrl() {
    return resolvedUrl || window.location.href;
  }

  async function copyLink() {
    const shareUrl = currentShareUrl();
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = shareUrl;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      try {
        textarea.select();
        if (!document.execCommand("copy")) {
          setCopyStatus("failed");
          return;
        }
      } catch {
        setCopyStatus("failed");
        return;
      } finally {
        textarea.remove();
      }
    }
    setCopyStatus("copied");
  }

  async function nativeShare() {
    if (!supportsNativeShare) return;
    try {
      await navigator.share({ title, url: currentShareUrl() });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copyLink();
    }
  }

  if (compact) {
    return (
      <div className={`${styles.sharePanel} ${styles.compact}`} role="group" aria-label={label}>
        <PublicActionButton
          variant="secondary"
          className={`${utilityStyles.utility} public-utility-action`}
          icon={<ShareIcon size={17} />}
          onClick={supportsNativeShare ? nativeShare : copyLink}
        >
          {copyFeedback ?? (supportsNativeShare ? "Zdieľať" : "Kopírovať odkaz")}
        </PublicActionButton>
      </div>
    );
  }

  return (
    <div className={styles.sharePanel} role="group" aria-label={label}>
      <span className={styles.label}>{label}</span>
      <div className={styles.actions}>
        <PublicActionLink
          href={shareTargets.facebook}
          variant="secondary"
          target="_blank"
          rel="noreferrer"
        >
          Facebook
        </PublicActionLink>
        <PublicActionLink
          href={shareTargets.whatsapp}
          variant="secondary"
          target="_blank"
          rel="noreferrer"
        >
          WhatsApp
        </PublicActionLink>
        {supportsNativeShare ? (
          <PublicActionButton variant="secondary" onClick={nativeShare}>
            Zdieľať…
          </PublicActionButton>
        ) : null}
        <PublicActionButton variant="tertiary" onClick={copyLink}>
          {copyFeedback ?? "Kopírovať odkaz"}
        </PublicActionButton>
      </div>
    </div>
  );
}
