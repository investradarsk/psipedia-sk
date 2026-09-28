"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  AdminActionButton,
  AdminDrawer,
  AdminHelpText,
} from "@/components/admin-interaction-system";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import type { EditorialAuthorKind, EditorialAuthorProfile } from "@/lib/editorial-authors";
import styles from "./admin-editorial-author-field.module.css";

type AuthorDraft = {
  id?: number;
  displayName: string;
  kind: EditorialAuthorKind;
  avatarUrl: string;
  shortBio: string;
  role: string;
  active: boolean;
  isDefault: boolean;
};

const EMPTY_AUTHOR: AuthorDraft = {
  displayName: "",
  kind: "individual",
  avatarUrl: "",
  shortBio: "",
  role: "",
  active: true,
  isDefault: false,
};

export function AdminEditorialAuthorField({
  selectedProfileId,
  legacyAuthor,
  onSelectionChange,
  onLegacyAuthorChange,
  onMessage,
  onError,
}: {
  selectedProfileId: number | null | undefined;
  legacyAuthor: string;
  onSelectionChange: (id: number | null, displayName?: string, markDirty?: boolean) => void;
  onLegacyAuthorChange: (value: string) => void;
  onMessage: (value: string) => void;
  onError: (value: string) => void;
}) {
  const [authors, setAuthors] = useState<EditorialAuthorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<AuthorDraft>(EMPTY_AUTHOR);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const selected = useMemo(
    () => authors.find((author) => author.id === selectedProfileId) ?? null,
    [authors, selectedProfileId],
  );

  async function loadAuthors(selectDefault = false) {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/editorial-authors", { cache: "no-store" });
      const data = await response.json() as { authors?: EditorialAuthorProfile[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Autorov sa nepodarilo načítať.");
      const nextAuthors = data.authors ?? [];
      setAuthors(nextAuthors);
      if (selectDefault && selectedProfileId === undefined) {
        const defaultAuthor = nextAuthors.find((author) => author.active && author.isDefault)
          ?? nextAuthors.find((author) => author.active && author.displayName === "Redakcia Psipedia");
        if (defaultAuthor) onSelectionChange(defaultAuthor.id, defaultAuthor.displayName, false);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "Autorov sa nepodarilo načítať.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    fetch("/api/admin/editorial-authors", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { authors?: EditorialAuthorProfile[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Autorov sa nepodarilo načítať.");
        return data.authors ?? [];
      })
      .then((nextAuthors) => {
        if (!active) return;
        setAuthors(nextAuthors);
        if (selectedProfileId === undefined) {
          const defaultAuthor = nextAuthors.find((author) => author.active && author.isDefault)
            ?? nextAuthors.find((author) => author.active && author.displayName === "Redakcia Psipedia");
          if (defaultAuthor) onSelectionChange(defaultAuthor.id, defaultAuthor.displayName, false);
        }
      })
      .catch((error) => {
        if (active) onError(error instanceof Error ? error.message : "Autorov sa nepodarilo načítať.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // Initial default resolution intentionally runs once. Later refreshes preserve the current selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setDraft(EMPTY_AUTHOR);
    setDrawerOpen(true);
  }

  function openEdit(author: EditorialAuthorProfile) {
    setDraft({
      id: author.id,
      displayName: author.displayName,
      kind: author.kind,
      avatarUrl: author.avatarUrl ?? "",
      shortBio: author.shortBio,
      role: author.role,
      active: author.active,
      isDefault: author.isDefault,
    });
    setDrawerOpen(true);
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    onError("");
    try {
      const result = await uploadAdminImage(file, "authors");
      setDraft((current) => ({ ...current, avatarUrl: result.imageUrl }));
      onMessage(adminImageUploadMessage(result, "Profil autora ešte ulož."));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Avatar sa nepodarilo nahrať.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function saveAuthor() {
    setSaving(true);
    onError("");
    try {
      const response = await fetch(
        draft.id ? `/api/admin/editorial-authors/${draft.id}` : "/api/admin/editorial-authors",
        {
          method: draft.id ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const data = await response.json() as { author?: EditorialAuthorProfile; error?: string };
      if (!response.ok || !data.author) throw new Error(data.error || "Profil autora sa nepodarilo uložiť.");
      const saved = data.author;
      await loadAuthors(false);
      if (saved.active && (selectedProfileId === saved.id || !draft.id)) {
        onSelectionChange(saved.id, saved.displayName);
      }
      onMessage(draft.id ? "Profil autora je uložený." : "Nový profil autora je vytvorený.");
      setDrawerOpen(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Profil autora sa nepodarilo uložiť.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateAuthor() {
    if (!draft.id || draft.isDefault) return;
    if (!window.confirm(`Deaktivovať autora „${draft.displayName}“? Existujúce články si zachovajú zobrazené meno autora.`)) return;
    setSaving(true);
    onError("");
    try {
      const response = await fetch(`/api/admin/editorial-authors/${draft.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, active: false, isDefault: false }),
      });
      const data = await response.json() as { author?: EditorialAuthorProfile; error?: string };
      if (!response.ok || !data.author) throw new Error(data.error || "Autora sa nepodarilo deaktivovať.");
      if (selectedProfileId === draft.id) onSelectionChange(null, data.author.displayName);
      await loadAuthors(false);
      onMessage("Autor je deaktivovaný. Staré články si zachovajú jeho meno.");
      setDrawerOpen(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Autora sa nepodarilo deaktivovať.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.field}>
      <div className={styles.selectionRow}>
        <div className="admin-field">
          <label htmlFor="article-author-profile">Autor</label>
          <select
            id="article-author-profile"
            value={selectedProfileId ?? "legacy"}
            disabled={loading}
            onChange={(event) => {
              if (event.target.value === "legacy") {
                onSelectionChange(null);
                return;
              }
              const author = authors.find((item) => item.id === Number(event.target.value));
              if (author?.active) onSelectionChange(author.id, author.displayName);
            }}
          >
            {authors.filter((author) => author.active || author.id === selectedProfileId).map((author) => (
              <option value={author.id} key={author.id} disabled={!author.active}>
                {author.displayName}{author.isDefault ? " · predvolený" : ""}{!author.active ? " · neaktívny" : ""}
              </option>
            ))}
            <option value="legacy">Vlastné / legacy meno</option>
          </select>
          <AdminHelpText>
            Nové články používajú predvolený aktívny profil. Legacy text autora zostáva podporovaný.
          </AdminHelpText>
        </div>
        <AdminActionButton variant="secondary" onClick={() => selected ? openEdit(selected) : openCreate()}>
          {selected ? "Upraviť autora" : "Spravovať autorov"}
        </AdminActionButton>
        <AdminActionButton variant="neutral" onClick={openCreate}>+ Nový autor</AdminActionButton>
      </div>

      {selectedProfileId == null && (
        <div className="admin-field">
          <label htmlFor="article-author-legacy">Meno autora pre legacy článok</label>
          <input
            id="article-author-legacy"
            value={legacyAuthor}
            onChange={(event) => onLegacyAuthorChange(event.target.value)}
            placeholder="Redakcia Psipedia"
          />
        </div>
      )}

      {selected && (
        <div className={styles.summary}>
          {selected.avatarUrl && <img src={selected.avatarUrl} alt="" />}
          <div>
            <strong>{selected.displayName}</strong>
            <span>{selected.role || (selected.kind === "team" ? "Redakcia / tím" : selected.kind === "external" ? "Externý autor" : "Autor")}</span>
            {selected.shortBio && <p>{selected.shortBio}</p>}
          </div>
        </div>
      )}

      <AdminDrawer
        open={drawerOpen}
        title={draft.id ? "Upraviť autora" : "Nový autor"}
        description="Profil sa používa naprieč redakciou. Deaktivácia nemaže historické články."
        onClose={() => setDrawerOpen(false)}
        footer={
          <div className={styles.drawerActions}>
            {draft.id && !draft.isDefault && draft.active && (
              <AdminActionButton variant="destructive" onClick={() => void deactivateAuthor()} disabled={saving || uploading}>
                Deaktivovať
              </AdminActionButton>
            )}
            <AdminActionButton variant="neutral" onClick={() => setDrawerOpen(false)}>Zrušiť</AdminActionButton>
            <AdminActionButton variant="primary" onClick={() => void saveAuthor()} disabled={saving || uploading || draft.displayName.trim().length < 2}>
              {saving ? "Ukladám…" : "Uložiť autora"}
            </AdminActionButton>
          </div>
        }
      >
        <div className={styles.drawerFields}>
          <div className="admin-field">
            <label htmlFor="author-display-name">Zobrazované meno</label>
            <input id="author-display-name" value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} />
          </div>
          <div className="admin-field">
            <label htmlFor="author-kind">Typ</label>
            <select id="author-kind" value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as EditorialAuthorKind }))}>
              <option value="individual">Jednotlivec</option>
              <option value="team">Tím / redakcia</option>
              <option value="external">Externý autor</option>
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="author-role">Rola <small>nepovinná</small></label>
            <input id="author-role" value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))} />
          </div>
          <div className="admin-field">
            <label htmlFor="author-bio">Krátke bio <small>nepovinné</small></label>
            <textarea id="author-bio" rows={4} value={draft.shortBio} onChange={(event) => setDraft((current) => ({ ...current, shortBio: event.target.value }))} />
          </div>
          <div className="admin-field">
            <label htmlFor="author-avatar-url">Avatar <small>nepovinný</small></label>
            {draft.avatarUrl && <img className={styles.avatarPreview} src={draft.avatarUrl} alt="Náhľad avatara" />}
            <input id="author-avatar-url" value={draft.avatarUrl} onChange={(event) => setDraft((current) => ({ ...current, avatarUrl: event.target.value }))} placeholder="https://… alebo /media/…" />
            <label className="admin-upload-button">
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => void uploadAvatar(event)} disabled={uploading} />
              {uploading ? "Nahrávam…" : "Nahrať avatar"}
            </label>
          </div>
          <label className="admin-check">
            <input type="checkbox" checked={draft.active} disabled={draft.isDefault || Boolean(draft.id && draft.active)} onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))} />
            <span><strong>Aktívny profil</strong><small>Neaktívny profil nemožno vybrať pre nový článok.</small></span>
          </label>
          <label className="admin-check">
            <input type="checkbox" checked={draft.isDefault} disabled={Boolean(draft.id && draft.isDefault)} onChange={(event) => setDraft((current) => ({ ...current, isDefault: event.target.checked, active: event.target.checked ? true : current.active }))} />
            <span><strong>Predvolený autor</strong><small>{draft.id && draft.isDefault ? "Predvoleného autora zmeníš nastavením iného profilu ako predvoleného." : "Predvolený profil musí zostať aktívny."}</small></span>
          </label>
        </div>
      </AdminDrawer>
    </div>
  );
}
