/** A successful canonical write does not imply a successful Notion transfer. */
export function inlineSaveMessage(status: unknown): string {
  const saved = "Zmeny uložené v databáze.";
  switch (status) {
    case "synced": return saved + " Notion: synchronizované.";
    case "unchanged": return saved + " Notion: bez potrebnej zmeny.";
    case "pending": return saved + " Notion: prenos čaká na potvrdenie.";
    case "disabled": return saved + " Notion: synchronizácia je vypnutá alebo zablokovaná.";
    case "unlinked": return saved + " Notion: záznam nie je prepojený.";
    default: return saved + " Notion: stav prenosu nepotvrdený.";
  }
}
