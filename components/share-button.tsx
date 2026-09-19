"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { PublicActionButton, PublicActionLink } from "@/components/public-visual-system";
import styles from "./share-button.module.css";

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
  const [copied, setCopied] = useState(false);
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
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function nativeShare() {
    if (!supportsNativeShare) return;
    try {
      await navigator.share({ title, url: currentShareUrl() });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
    }
  }

  if (compact) {
    return (
      <div className={`${styles.sharePanel} ${styles.compact}`} role="group" aria-label={label}>
        <PublicActionButton variant="secondary" onClick={supportsNativeShare ? nativeShare : copyLink}>
          {copied ? "Odkaz skopírovaný" : supportsNativeShare ? "Zdieľať" : "Kopírovať odkaz"}
        </PublicActionButton>
      </div>
    );
  }

  return (
    <div className={styles.sharePanel} role="group" aria-label={label}>
      <span className={styles.label}>{label}</span>
      <div className={styles.actions}>
        <PublicActionLink href={shareTargets.facebook} variant="secondary" target="_blank" rel="noreferrer">
          Facebook
        </PublicActionLink>
        <PublicActionLink href={shareTargets.whatsapp} variant="secondary" target="_blank" rel="noreferrer">
          WhatsApp
        </PublicActionLink>
        {supportsNativeShare ? (
          <PublicActionButton variant="secondary" onClick={nativeShare}>
            Zdieľať…
          </PublicActionButton>
        ) : null}
        <PublicActionButton variant="tertiary" onClick={copyLink}>
          {copied ? "Odkaz skopírovaný" : "Kopírovať odkaz"}
        </PublicActionButton>
      </div>
    </div>
  );
}
