"use client";

import { useEffect, useRef, useState } from "react";

type Suggestion = {
  providerResultId: string;
  formatted: string;
  addressLine1: string;
  addressLine2: string;
  street: string;
  city: string;
  district: string;
  region: string;
  resultType: string;
};

export function DirectoryAddressAutocomplete({
  region,
  district,
  city,
  selectedProviderResultId,
  selectedStreet,
  selectedLocalityConfirmed,
  disabled = false,
  onSelect,
  onUseLocality,
  onClearSelection,
}: {
  region: string;
  district: string;
  city: string;
  selectedProviderResultId: string;
  selectedStreet: string;
  selectedLocalityConfirmed: boolean;
  disabled?: boolean;
  onSelect: (suggestion: Suggestion) => void;
  onUseLocality: (locality: string) => void;
  onClearSelection: () => void;
}) {
  const [query, setQuery] = useState(selectedStreet);
  const [searchActivated, setSearchActivated] = useState(!selectedStreet);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const localityReady = Boolean(region && district && city);
  const canSearch = searchActivated && !selectedProviderResultId && !selectedLocalityConfirmed && !disabled && localityReady && query.trim().length >= 3;
  const canUseLocality = canSearch && query.trim().length >= 3;

  useEffect(() => {
    if (!canSearch) {
      abortRef.current?.abort();
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setEmpty(false);
      setError("");
      try {
        const params = new URLSearchParams({ region, district, city, q: query.trim() });
        const response = await fetch(`/api/admin/directory/address-autocomplete?${params.toString()}`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        const data = await response.json() as { suggestions?: Suggestion[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Ulice sa nepodarilo vyhľadať.");
        const next = (data.suggestions ?? []).slice(0, 5);
        setSuggestions(next);
        setEmpty(next.length === 0);
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setError(requestError instanceof Error ? requestError.message : "Ulice sa nepodarilo vyhľadať.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 325);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canSearch, city, district, query, region]);

  function choose(item: Suggestion) {
    setQuery(item.street);
    setSuggestions([]);
    setEmpty(false);
    setError("");
    onSelect(item);
  }

  function useTypedLocality() {
    const locality = query.trim().replace(/\s+/g, " ");
    if (locality.length < 3) return;
    setQuery(locality);
    setSuggestions([]);
    setEmpty(false);
    setError("");
    setSearchActivated(false);
    onUseLocality(locality);
  }

  const visibleSuggestions = canSearch ? suggestions : [];
  const visibleLoading = canSearch && loading;
  const visibleEmpty = canSearch && empty;
  const visibleError = canSearch ? error : "";

  return (
    <div className="admin-field" data-directory-address-autocomplete>
      <label htmlFor="directory-address-autocomplete">Ulica / lokalita</label>
      <div className="partner-location-combobox">
        <input
          id="directory-address-autocomplete"
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={visibleSuggestions.length > 0 || canUseLocality}
          aria-controls="directory-address-suggestions"
          value={query}
          disabled={disabled || !localityReady}
          placeholder={localityReady ? "Začni písať názov ulice, napr. hvi" : "Najprv vyber obec / mesto"}
          onChange={(event) => {
            setSearchActivated(true);
            if (selectedProviderResultId || selectedLocalityConfirmed) onClearSelection();
            setQuery(event.target.value);
          }}
        />
        {visibleSuggestions.length > 0 ? (
          <ul id="directory-address-suggestions" role="listbox" className="partner-location-options">
            {visibleSuggestions.map((item) => (
              <li key={item.providerResultId} role="option" aria-selected={false}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(item)}
                  style={{ width: "100%", textAlign: "left" }}
                >
                  <strong>{item.street}</strong>
                  <br />
                  <small>{[item.city, item.district].filter(Boolean).join(" · ")}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {canUseLocality ? (
          <div style={{ marginTop: "0.5rem", display: "grid", gap: "0.35rem" }}>
            <small>Nenašiel si správnu ulicu?</small>
            <button type="button" className="admin-button-secondary" onClick={useTypedLocality}>
              Použiť „{query.trim()}“ ako lokalitu
            </button>
          </div>
        ) : null}
      </div>
      <small>Vyber ulicu zo zoznamu. Ak ide o areál, cvičisko, nábrežie, park alebo iné miesto bez presnej Geoapify ulice, môžeš vedome použiť zadaný text ako lokalitu.</small>
      <span aria-live="polite">
        {visibleLoading ? "Vyhľadávam ulice…" : ""}
        {!visibleLoading && visibleEmpty ? "V tejto lokalite sa nenašla zodpovedajúca ulica." : ""}
        {visibleError ? visibleError : ""}
        {selectedProviderResultId ? "Ulica je vybraná. Doplň číslo domu alebo nechaj pole prázdne pri mieste bez čísla." : ""}
        {selectedLocalityConfirmed ? (
          <>
            ✓ Použitá lokalita: {query}. Táto lokalita nebola vybraná zo zoznamu ulíc. Presné miesto musí následne potvrdiť Google Maps.
          </>
        ) : null}
      </span>
    </div>
  );
}
