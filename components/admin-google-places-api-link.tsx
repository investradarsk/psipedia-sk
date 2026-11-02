/**
 * Čisto navigačný odkaz na Google Cloud. Úmyselne nekontroluje stav API
 * a nikdy nevykonáva Google Places request ani Enable/Disable.
 */
export const GOOGLE_PLACES_API_SETTINGS_URL =
  "https://console.cloud.google.com/google/maps-apis/api-list?project=psipedia-production&authuser=1";

export function AdminGooglePlacesApiLink({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="admin-help"
      data-google-places-api-settings-link
      style={{ marginTop: compact ? 0 : 8, minWidth: 0 }}
    >
      <a
        href={GOOGLE_PLACES_API_SETTINGS_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontWeight: 650, textDecoration: "underline", textUnderlineOffset: 2 }}
      >
        Zapnúť / vypnúť Google Places API ↗
      </a>
      {!compact ? (
        <p style={{ margin: "4px 0 0" }}>
          V Google Cloud vyber Places API (New). Pred vyhľadávaním ho ručne zapni,
          po dokončení opäť vypni. Odkaz nemení stav API a jeho stav tu neoverujeme.
        </p>
      ) : null}
    </div>
  );
}
