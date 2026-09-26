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
  disabled = false,
  onSelect,
  onClearSelection,
}: {
  region: string;
  district: string;
  city: string;
  selectedProviderResultId: string;
  selectedStreet: string;
  disabled?: boolean;
  onSelect: (suggestion: Suggestion) => void;
  onClearSelection: () => void;
}) {
  const [query, setQuery] = useState(selectedStreet);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const localityReady = Boolean(region && district && city);
  const canSearch = !selectedProviderResultId && !disabled && localityReady && query.trim().length >= 3;

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

  const visibleSuggestions = canSearch ? suggestions : [];
  const visibleLoading = canSearch && loading;
  const visibleEmpty = canSearch && empty;
  const visibleError = canSearch ? error : "";

  return (
    <div className="admin-field" data-directory-address-autocomplete>
      <label htmlFor="directory-address-autocomplete">Ulica</label>
      <div className="partner-location-combobox">
        <input
          id="directory-address-autocomplete"
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={visibleSuggestions.length > 0}
          aria-controls="directory-address-suggestions"
          value={query}
          disabled={disabled || !localityReady}
          placeholder={localityReady ? "Začni písať názov ulice, napr. hvi" : "Najprv vyber obec / mesto"}
          onChange={(event) => {
            if (selectedProviderResultId) onClearSelection();
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
      </div>
      <small>Napíš aspoň 3 znaky názvu ulice a vyber ju zo zoznamu. Číslo domu zadáš samostatne.</small>
      <span aria-live="polite">
        {visibleLoading ? "Vyhľadávam ulice…" : ""}
        {!visibleLoading && visibleEmpty ? "V tejto lokalite sa nenašla zodpovedajúca ulica." : ""}
        {visibleError ? visibleError : ""}
        {selectedProviderResultId ? "Ulica je vybraná. Doplň číslo domu." : ""}
      </span>
    </div>
  );
}
