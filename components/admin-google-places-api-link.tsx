/**
 * One manual shortcut for operator-controlled Google Places (New) billing.
 * Opening the console is read-only; enabling/disabling remains a Google Cloud action.
 */
export const GOOGLE_PLACES_API_CONSOLE_URL =
  "https://console.cloud.google.com/google/maps-apis/api-list?project=psipedia-production&authuser=1";

export function AdminGooglePlacesApiLink({ compact = false }: { compact?: boolean }) {
  return (
    <p className="admin-help" data-google-places-api-console-link>
      <a href={GOOGLE_PLACES_API_CONSOLE_URL} target="_blank" rel="noopener noreferrer">
        Spravovať Google Places API (zapnúť / vypnúť) ↗
      </a>
      {!compact ? (
        <span> · V Google Cloud vyber Places API (New). Po ručnom vyhľadaní ho opäť vypni, aby nevznikali ďalšie náklady.</span>
      ) : null}
    </p>
  );
}
