"use client";

import { useEffect, useRef, useState } from "react";
import { ArticleBlocks } from "@/components/article-blocks";
import { EditorialRichText } from "@/components/editorial-rich-text";
import { ImageDisplay } from "@/components/image-display";
import type { ImageDisplayConfig } from "@/lib/image-display";
import type { EditorialRichTextDocument } from "@/lib/editorial-content";
import type { ArticleBlock } from "@/lib/article-blocks";
import styles from "./admin-article-fullscreen-preview.module.css";

type PreviewProps = {
  open: boolean;
  onClose: () => void;
  sectionLabel: string;
  category: string;
  title: string;
  excerpt: string;
  imageUrl: string;
  imageAlt: string;
  imageCaption: string;
  imageCredit: string;
  imageConfig: ImageDisplayConfig | null;
  introRichText: EditorialRichTextDocument;
  takeawayRichText: EditorialRichTextDocument;
  takeaway: string;
  blocks: ArticleBlock[];
  promoUtcDay?: string;
};

/** Browser top-layer preview of unsaved React state. Never sends a request. */
export function AdminArticleFullscreenPreview(props: PreviewProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (props.open && !element.open) element.showModal();
    if (!props.open && element.open) element.close();
  }, [props.open]);
  useEffect(() => () => {
    if (dialog.current?.open) dialog.current.close();
  }, []);

  return (
    <dialog ref={dialog} className={styles.dialog} onClose={props.onClose}
      aria-label="Celoobrazovkový náhľad článku" data-article-fullscreen-preview>
      <div className={styles.shell}>
        <header className={styles.toolbar}>
          <div>
            <strong>Náhľad článku</strong>
            <span>Neuložené zmeny · bez publikovania</span>
          </div>
          <div className={styles.controls} role="group" aria-label="Zobrazenie náhľadu">
            <button type="button" aria-pressed={device === "desktop"}
              onClick={() => setDevice("desktop")}>Počítač</button>
            <button type="button" aria-pressed={device === "mobile"}
              onClick={() => setDevice("mobile")}>Mobil</button>
            <button type="button" className={styles.close} onClick={props.onClose}
              autoFocus>Späť do editora</button>
          </div>
        </header>
        <div className={styles.viewport}>
          <div className={styles.page} data-preview-device={device}>
            <article className={styles.article}>
              <div className={styles.eyebrow}>{props.sectionLabel}{props.category ? " · " + props.category : ""}</div>
              <h1>{props.title || "Názov článku"}</h1>
              <p className={styles.excerpt}>{props.excerpt || "Krátky úvod článku."}</p>
              {props.imageUrl && (
                <figure className={styles.image}>
                  <ImageDisplay context="detail" src={props.imageUrl}
                    config={props.imageConfig} alt={props.imageAlt || props.title} loading="lazy" />
                  {(props.imageCaption || props.imageCredit) && (
                    <figcaption>{props.imageCaption}{props.imageCaption && props.imageCredit ? " · " : ""}
                      {props.imageCredit ? "Foto: " + props.imageCredit : ""}</figcaption>
                  )}
                </figure>
              )}
              <div className={styles.prose}>
                <EditorialRichText document={props.introRichText} />
                {props.takeaway.trim() && <aside className={styles.takeaway}>
                  <strong>To najdôležitejšie</strong>
                  <EditorialRichText document={props.takeawayRichText} />
                </aside>}
                <ArticleBlocks blocks={props.blocks} preview promoUtcDay={props.promoUtcDay} />
              </div>
            </article>
          </div>
        </div>
      </div>
    </dialog>
  );
}
