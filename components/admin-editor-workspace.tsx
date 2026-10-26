"use client";

import {
  useCallback,
  useId,
  useRef,
  useState,
  useEffect,
  type ReactNode,
  type RefObject,
} from "react";
import {
  AdminActionButton,
  AdminEditorSection,
  AdminModalDialog,
} from "@/components/admin-interaction-system";
import styles from "./admin-editor-workspace.module.css";

export { AdminEditorSection as EditorSection } from "@/components/admin-interaction-system";

export type EditorWorkspaceSection = { id: string; label: string };
export type EditorStatusTone = "neutral" | "success" | "warning" | "danger";

export function EditorStatus({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: EditorStatusTone;
}) {
  return <span className={styles.status} data-tone={tone} data-editor-status>{label}</span>;
}

export function EditorHeader({
  title,
  description,
  status,
  onClose,
  closeLabel,
}: {
  title?: string;
  description?: string;
  status?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}) {
  const headingId = useId();
  if (!title && !description && !status && !onClose) return null;
  return (
    <header className={styles.header} data-editor-header aria-labelledby={title ? headingId : undefined}>
      <div className={styles.headerText}>
        {title && <h1 id={headingId}>{title}</h1>}
        {description && <p>{description}</p>}
        {status && <div className={styles.statusLine}>{status}</div>}
      </div>
      {onClose && (
        <AdminActionButton type="button" variant="neutral" onClick={onClose} aria-label={closeLabel ?? "Zavrieť editor"}>
          {closeLabel ?? "Zavrieť"}
        </AdminActionButton>
      )}
    </header>
  );
}

export function EditorSectionNavigation({
  sections,
  activeSection,
  onNavigate,
  previewAvailable = false,
  showingPreview = false,
  onTogglePreview,
}: {
  sections: EditorWorkspaceSection[];
  activeSection: string;
  onNavigate: (id: string) => void;
  previewAvailable?: boolean;
  showingPreview?: boolean;
  onTogglePreview?: () => void;
}) {
  return (
    <nav className={styles.navigation} aria-label="Sekcie pracovného editora" data-editor-navigation>
      <div className={styles.navigationLinks}>
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-current={!showingPreview && activeSection === section.id ? "location" : undefined}
            onClick={() => onNavigate(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>
      <label className={styles.mobileSectionSelect}>
        <span>Sekcia editora</span>
        <select
          aria-label="Sekcia editora"
          value={activeSection}
          onChange={(event) => onNavigate(event.target.value)}
        >
          {sections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
        </select>
      </label>
      {previewAvailable && (
        <button
          className={styles.previewToggle}
          type="button"
          aria-pressed={showingPreview}
          onClick={onTogglePreview}
        >
          {showingPreview ? "Späť na úpravy" : "Náhľad"}
        </button>
      )}
    </nav>
  );
}

export function EditorContent({
  children,
  contentRef,
}: {
  children: ReactNode;
  contentRef?: RefObject<HTMLDivElement | null>;
}) {
  return <div className={styles.content} ref={contentRef} data-editor-content>{children}</div>;
}

export function EditorPreview({
  title = "Živý náhľad",
  focusable = false,
  children,
}: {
  title?: string;
  focusable?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={styles.preview} aria-label={title} tabIndex={focusable ? 0 : undefined} data-editor-preview>
      <h2>{title}</h2>
      <div className={styles.previewInner}>{children}</div>
    </section>
  );
}

export function EditorActionBar({
  primary,
  secondary,
  destructive,
  message,
  feedback,
}: {
  primary?: ReactNode;
  secondary?: ReactNode;
  destructive?: ReactNode;
  message?: ReactNode;
  /** Already-announced alert/status element; render without nesting in another live region. */
  feedback?: ReactNode;
}) {
  return (
    <div className={styles.actionBar} data-editor-actionbar>
      <div className={styles.actionStart}>
        {destructive}
        {message && <div className={styles.actionMessage} role="status" aria-live="polite">{message}</div>}
        {feedback}
      </div>
      <div className={styles.actionEnd}>{secondary}{primary}</div>
    </div>
  );
}

export function EditorUnsavedChangesGuard({
  active,
  open,
  onStay,
  onDiscard,
  allowNativeExitRef,
}: {
  active: boolean;
  open: boolean;
  onStay: () => void;
  onDiscard: () => void;
  allowNativeExitRef?: RefObject<boolean>;
}) {
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (allowNativeExitRef?.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active, allowNativeExitRef]);

  return (
    <AdminModalDialog
      open={open}
      title="Neuložené zmeny"
      description="Upravované údaje zatiaľ nie sú uložené."
      onClose={onStay}
      preferExplicitAutofocus
      footer={
        <>
          <AdminActionButton variant="neutral" data-admin-autofocus="true" onClick={onStay}>Pokračovať v úpravách</AdminActionButton>
          <AdminActionButton variant="destructive" onClick={onDiscard}>Zahodiť zmeny a zavrieť</AdminActionButton>
        </>
      }
    >
      <p>Ak teraz opustíte editor, neuložené úpravy sa stratia.</p>
    </AdminModalDialog>
  );
}

export function EditorWorkspace({
  mode = "modal",
  open = true,
  title,
  description,
  status,
  sections,
  preview,
  previewTitle,
  previewFocusable = false,
  actions,
  dirty = false,
  onClose,
  closeLabel,
  children,
}: {
  mode?: "modal" | "page";
  open?: boolean;
  title: string;
  description?: string;
  status?: ReactNode;
  sections: EditorWorkspaceSection[];
  preview?: ReactNode;
  previewTitle?: string;
  previewFocusable?: boolean;
  /** Optional render callback lets custom footer buttons reuse the workspace's guarded close. */
  actions?: ReactNode | ((requestClose: () => void) => ReactNode);
  dirty?: boolean;
  onClose?: () => void;
  closeLabel?: string;
  children: ReactNode;
}) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? "");
  const [showPreview, setShowPreview] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const requestClose = useCallback(() => {
    if (!onClose) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  }, [dirty, onClose]);
  const discard = () => {
    setConfirmClose(false);
    onClose?.();
  };
  const navigate = (id: string) => {
    setShowPreview(false);
    setActiveSection(id);
    const target = Array.from(contentRef.current?.querySelectorAll<HTMLElement>("[data-admin-editor-section]") ?? [])
      .find((section) => section.id === id);
    if (target) {
      target.scrollIntoView({ block: "start", behavior: "smooth" });
      target.focus({ preventScroll: true });
    }
  };

  const resolvedActions = typeof actions === "function" ? actions(requestClose) : actions;

  const body = (
    <div className={styles.workspace} data-editor-workspace data-mobile-panel={showPreview ? "preview" : "edit"}>
      <EditorHeader status={mode === "modal" ? status : undefined} />
      <EditorSectionNavigation
        sections={sections}
        activeSection={activeSection}
        onNavigate={navigate}
        previewAvailable={Boolean(preview)}
        showingPreview={showPreview}
        onTogglePreview={() => setShowPreview((value) => !value)}
      />
      <div className={styles.columns} data-editor-columns={preview ? "with-preview" : "single"}>
        <EditorContent contentRef={contentRef}>{children}</EditorContent>
        {preview && <EditorPreview title={previewTitle} focusable={previewFocusable}>{preview}</EditorPreview>}
      </div>
    </div>
  );

  return (
    <>
      {mode === "modal" ? (
        <AdminModalDialog
          open={open}
          title={title}
          description={description}
          className={styles.workspaceModal}
          onClose={requestClose}
          footer={resolvedActions}
        >
          {body}
        </AdminModalDialog>
      ) : (
        <section className={styles.pageWorkspace} aria-label={title} data-editor-page>
          <EditorHeader title={title} description={description} status={status} onClose={onClose ? requestClose : undefined} closeLabel={closeLabel} />
          {body}
          {resolvedActions && <div className={styles.pageActions}>{resolvedActions}</div>}
        </section>
      )}
      <EditorUnsavedChangesGuard
        active={dirty && (mode === "page" || open)}
        open={confirmClose && (mode === "page" || open)}
        onStay={() => setConfirmClose(false)}
        onDiscard={discard}
      />
    </>
  );
}

// Field ownership, serialization, validation and publish decisions remain with each canonical editor.
void AdminEditorSection;
