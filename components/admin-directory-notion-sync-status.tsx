import { env } from "cloudflare:workers";
import { readDirectoryNotionSyncDiagnostic } from "@/lib/directory-notion-sync-diagnostics";

function localTime(utc: string | null): string {
  if (!utc) return "Bez záznamu";
  const normalized = utc.includes("T") ? utc : utc.replace(" ", "T") + "Z";
  const time = new Date(normalized);
  return Number.isFinite(time.getTime())
    ? new Intl.DateTimeFormat("sk-SK", {
        dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Bratislava",
      }).format(time)
    : "Neznámy čas";
}

/** Visible only behind Admin Access. Read-only; never mutates D1 or Notion. */
export async function AdminDirectoryNotionSyncStatus({ profileId }: { profileId: number }) {
  const database = (env as unknown as {DB?: D1Database}).DB;
  if (!database) return null;
  const evidence = await readDirectoryNotionSyncDiagnostic(database, profileId).catch(() => null);
  return <details className="admin-form-card" data-directory-notion-sync-diagnostics>
    <summary><strong>Notion – diagnostika synchronizácie</strong></summary>
    {!evidence ? <p>Diagnostiku sa nepodarilo načítať. Neznamená to, že je synchronizácia v poriadku.</p>
      : !evidence.linked ? <p>Profil nemá potvrdené mapovanie na Notion stránku.</p>
      : <>
        <p>Prepojenie: existuje. Posledný záznam pôvodného mapovania: <strong>{localTime(evidence.mappingAt)}</strong>.
          Tento údaj nie je potvrdením aktuálneho webhooku.</p>
        <p>Redakčný baseline: <strong>{localTime(evidence.editorialBaselineAt)}</strong>.
          Služby V3 – posledný potvrdený stav: <strong>{localTime(evidence.serviceV3BaselineAt)}</strong>.</p>
        <p>V3 výbery: Admin „Áno“ <strong>{evidence.v3YesInAdmin ?? "neznáme"}</strong>,
          potvrdený spoločný V3 stav <strong>{evidence.v3ConfirmedIds ?? "neznáme"}</strong>.
          Samotný počet nie je dôkazom zhody konkrétnych služieb.</p>
        {evidence.inbox === null ? <p>Webhook inbox nie je dostupný (migrácia alebo výpadok).</p>
          : evidence.inbox.length === 0 ? <p>V inboxe nie je záznam pre tento profil.
              Okamžité webhooky môžu obísť front; prázdny inbox preto nedokazuje, že webhook neprišiel.</p>
          : <p>Webhook inbox: {evidence.inbox.map(item =>
              item.status + " " + item.count).join(" · ")}.</p>}
        {evidence.lastInbox ? <p>Posledný záznam vo fronte: {localTime(evidence.lastInbox.receivedAt)}
          {" · "}{evidence.lastInbox.status}
          {" · pokusy: "}{evidence.lastInbox.attempts}
          {evidence.lastInbox.errorCode ? " · " + evidence.lastInbox.errorCode : ""}
          {evidence.lastInbox.outcome ? " · " + evidence.lastInbox.outcome : ""}</p> : null}
        {evidence.alert ? <p role="alert">Neuzavreté upozornenie ({evidence.alert.direction}):
          {" "}{evidence.alert.message}</p> : null}
        <p>Stav Notion webhook subscription (Active/Paused) z D1 nevieme potvrdiť.
          Pri neprenášajúcich sa zmenách skontroluj subscription a Cloudflare Worker logy.</p>
      </>}
  </details>;
}
