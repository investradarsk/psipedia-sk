"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  geoAdminOperatorStateLabels,
  type GeoAdminOperatorRow,
  type GeoAdminOperatorState,
  type GeoAdminOperatorSummary,
} from "@/lib/geo-admin-operator";

const filters: Array<{ value: "ALL" | "ERRORS" | GeoAdminOperatorState; label: string }> = [
  { value: "ALL", label: "Všetky" },
  { value: "ON_MAP", label: "Na mape" },
  { value: "PENDING", label: "Čaká na spracovanie" },
  { value: "NEEDS_REVIEW", label: "Treba skontrolovať" },
  { value: "MISSING_ADDRESS", label: "Chýba adresa" },
  { value: "ERRORS", label: "Chyby" },
];

const stateIcon: Record<GeoAdminOperatorState, string> = {
  ON_MAP: "🟢",
  PENDING: "🔵",
  NEEDS_REVIEW: "🟡",
  MISSING_ADDRESS: "🔴",
  INCOMPLETE_ADDRESS: "🔴",
  INVALID_ADDRESS: "🔴",
  FAILED: "🔴",
  NOT_PUBLIC: "⚪",
};

function matchesFilter(state: GeoAdminOperatorState, filter: string) {
  if (filter === "ALL") return true;
  if (filter === "ERRORS") return ["INCOMPLETE_ADDRESS", "INVALID_ADDRESS", "FAILED"].includes(state);
  return state === filter;
}

function addressLabel(item: GeoAdminOperatorRow) {
  if (item.formattedAddress) return item.formattedAddress.split("\n");
  if (item.city) return [item.city];
  return ["—"];
}

export function AdminGeoOperatorDashboard({
  items,
  summary,
}: {
  items: GeoAdminOperatorRow[];
  summary: GeoAdminOperatorSummary;
}) {
  const [filter, setFilter] = useState<string>("ALL");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("sk");
    return items.filter((item) => {
      if (!matchesFilter(item.operatorState, filter)) return false;
      if (!needle) return true;
      return `${item.name} ${item.city} ${item.district} ${item.region} ${item.category} ${item.categoryLabel}`
        .toLocaleLowerCase("sk")
        .includes(needle);
    });
  }, [filter, items, query]);

  const cards: Array<{ state: GeoAdminOperatorState; label: string }> = [
    { state: "ON_MAP", label: "Na mape" },
    { state: "PENDING", label: "Čaká na spracovanie" },
    { state: "NEEDS_REVIEW", label: "Treba skontrolovať" },
    { state: "MISSING_ADDRESS", label: "Chýba adresa" },
    { state: "INCOMPLETE_ADDRESS", label: "Neúplná / neplatná adresa" },
    { state: "FAILED", label: "Spracovanie zlyhalo" },
  ];

  return (
    <div data-admin-geo-operator>
      <section className="admin-form-card" aria-labelledby="geo-operator-summary">
        <div className="admin-overview-heading">
          <div>
            <span>MAPA — PROFILY</span>
            <h2 id="geo-operator-summary">Stav verejných profilov</h2>
          </div>
          <p>Canonical adresa sa číta priamo z profilu. GEO admin ju nikdy neprepisuje druhýkrát.</p>
        </div>
        <div className="admin-stats" aria-label="Súhrn geo stavov">
          {cards.map(({ state, label }) => (
            <div key={state}>
              <span>{stateIcon[state]} {label}</span>
              <strong>{state === "INCOMPLETE_ADDRESS" ? summary.INCOMPLETE_ADDRESS + summary.INVALID_ADDRESS : summary[state]}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-form-card">
        <div className="admin-toolbar" style={{ alignItems: "stretch", gap: 12, flexWrap: "wrap" }}>
          <label className="admin-search" style={{ flex: "1 1 280px", minWidth: 0 }}>
            <span className="sr-only">Hľadať profil</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Hľadať názov, obec, okres alebo kategóriu"
            />
          </label>
          <div className="admin-status-filter" aria-label="Filtrovať profily podľa geo stavu" style={{ flexWrap: "wrap" }}>
            {filters.map((item) => (
              <button
                type="button"
                key={item.value}
                className={filter === item.value ? "is-active" : ""}
                aria-pressed={filter === item.value}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <p className="admin-help" aria-live="polite">
          Zobrazené: {visible.length} z {items.length} publikovaných profilov.
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          {visible.map((item) => {
            const lines = addressLabel(item);
            const addressProblem = ["MISSING_ADDRESS", "INCOMPLETE_ADDRESS", "INVALID_ADDRESS"].includes(item.operatorState);
            const review = item.operatorState === "NEEDS_REVIEW";
            return (
              <article
                key={item.id}
                className="admin-form-card"
                data-operator-state={item.operatorState}
                style={{ margin: 0, overflow: "hidden" }}
              >
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="admin-article-tags" style={{ marginBottom: 6 }}>
                      <span>{item.categoryLabel}</span>
                      <span>{stateIcon[item.operatorState]} {geoAdminOperatorStateLabels[item.operatorState]}</span>
                    </div>
                    <h3 style={{ margin: 0 }}>{item.name}</h3>
                    <p className="admin-help" style={{ margin: "8px 0 0", whiteSpace: "pre-line" }}>
                      <strong>Adresa prevádzky:</strong><br />
                      {lines.map((line, index) => <span key={index}>{line}{index < lines.length - 1 ? <br /> : null}</span>)}
                    </p>
                    <p className="admin-help" style={{ margin: "6px 0 0" }}>
                      <strong>Stav adresy:</strong> {item.addressState === "COMPLETE" ? "🟢 Kompletná" : item.addressState === "MISSING" ? "🔴 Chýba" : item.addressState === "INCOMPLETE" ? "🔴 Neúplná" : "🟡 Treba skontrolovať"}
                      {" · "}
                      <strong>Stav mapy:</strong> {stateIcon[item.operatorState]} {geoAdminOperatorStateLabels[item.operatorState]}
                    </p>
                    <p className="admin-help" style={{ margin: "6px 0 0" }}>{item.operatorReason}</p>
                  </div>

                  <div className="admin-row-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {addressProblem ? (
                      <Link className="admin-primary-action" href={item.editorHref}>
                        {item.operatorState === "MISSING_ADDRESS" ? "Otvoriť profil a doplniť adresu" : "Opraviť adresu"}
                      </Link>
                    ) : review ? (
                      <>
                        <Link className="admin-primary-action" href={item.editorHref}>Skontrolovať problém</Link>
                        <Link href={item.attentionHref}>Centrum pozornosti</Link>
                      </>
                    ) : (
                      <Link href={`/admin/adresar/${item.id}`}>Otvoriť profil</Link>
                    )}
                  </div>
                </div>

                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 700 }}>Technické detaily</summary>
                  <div className="admin-help" style={{ marginTop: 10, display: "grid", gap: 4, overflowWrap: "anywhere" }}>
                    <span>target type: DIRECTORY_PROFILE</span>
                    <span>canonical ID: {item.id}</span>
                    <span>geo_point ID: {item.geoPointId ?? "—"}</span>
                    <span>geocode_status: {item.geocodeStatus ?? "—"}</span>
                    <span>public_visibility: {item.publicVisibility ?? "—"}</span>
                    <span>precision: {item.publicPrecision ?? "—"}</span>
                    <span>provider: {item.provider ?? "—"}</span>
                    <span>normalized query: {item.normalizedQuery ?? "—"}</span>
                    <span>source_fingerprint: {item.sourceFingerprint ?? "—"}</span>
                    <span>resolved_source_fingerprint: {item.resolvedSourceFingerprint ?? "—"}</span>
                    <span>latitude: {item.latitude ?? "—"}</span>
                    <span>longitude: {item.longitude ?? "—"}</span>
                    <span>error/reason code: {item.errorCode ?? item.addressReason}</span>
                    <span>manual override: {item.manualOverride ? "áno" : "nie"}</span>
                    <span>updated: {item.updatedAt ?? "—"}</span>
                    {item.legacyAddress && !item.formattedAddress ? (
                      <span><strong>Historická adresa — nepotvrdená ako prevádzka:</strong> {item.legacyAddress}</span>
                    ) : null}
                  </div>
                </details>
              </article>
            );
          })}

          {!visible.length ? (
            <div className="admin-empty">
              <span>🗺️</span>
              <h2>Žiadne profily pre zvolený filter</h2>
              <p>Skús zmeniť stav alebo vyhľadávanie.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
