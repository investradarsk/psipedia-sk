"use client";

import { useEffect, useMemo, useState } from "react";
import { PublicActionButton, PublicActionLink } from "@/components/public-visual-system";
import styles from "./share-button.module.css";

export function ShareButton({
  title,
  label = "Zdieľať článok",
  url,
}: {
  title: string;
  label?: string;
  url?: string;
}) {
  const [resolvedUrl, setResolvedUrl] = useState(url ?? "");
  const [copied, setCopied] = useState(false);
  const [supportsNativeShare, setSupportsNativeShare] = useState(false);

  useEffect(() => {
    if (!resolvedUrl) setResolvedUrl(window.location.href);
    setSupportsNativeShare(typeof navigator.share === "function");
  }, [resolvedUrl]);

  const shareTargets = useMemo(() => {
    const encodedUrl = encodeURIComponent(resolvedUrl);
    const encodedText = encodeURIComponent(`${title} ${resolvedUrl}`);
    return {
      facebook: resolvedUrl ? `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` : "#",
      whatsapp: resolvedUrl ? `https://wa.me/?text=${encodedText}` : "#",
    };
  }, [resolvedUrl, title]);

  async function copyLink() {
    if (!resolvedUrl) return;
    try {
      await navigator.clipboard.writeText(resolvedUrl);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = resolvedUrl;
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
    if (!supportsNativeShare || !resolvedUrl) return;
    try {
      await navigator.share({ title, url: resolvedUrl });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
    }
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
