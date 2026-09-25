"use client";

import { useId, useMemo, useState } from "react";
import {
  SLOVAK_REGIONS,
  getSlovakDistricts,
  searchSlovakMunicipalities,
  type SlovakLocation,
} from "@/lib/slovakia-locations";

type LocationErrors = Partial<Record<"region" | "district" | "city", string>>;

type Props = {
  value: SlovakLocation;
  onChange: (value: SlovakLocation) => void;
  required?: boolean;
  disabled?: boolean;
  idPrefix?: string;
  errors?: LocationErrors;
};

export function SlovakiaLocationSelector({
  value,
  onChange,
  required = false,
  disabled = false,
  idPrefix = "slovakia-location",
  errors = {},
}: Props) {
  const reactId = useId().replace(/:/g, "");
  const baseId = `${idPrefix}-${reactId}`;
  const listboxId = `${baseId}-municipalities`;
  const hintId = `${baseId}-municipality-hint`;
  const statusId = `${baseId}-municipality-status`;
  const regionErrorId = `${baseId}-region-error`;
  const districtErrorId = `${baseId}-district-error`;
  const cityErrorId = `${baseId}-municipality-error`;

  const [selectedRegion, setSelectedRegion] = useState(value.region);
  const [selectedDistrict, setSelectedDistrict] = useState(value.district);
  const [selectedCity, setSelectedCity] = useState(value.city);
  const [query, setQuery] = useState(value.city);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const districts = useMemo(() => getSlovakDistricts(selectedRegion), [selectedRegion]);
  const municipalities = useMemo(
    () => selectedDistrict ? searchSlovakMunicipalities(selectedDistrict, query, 80) : [],
    [selectedDistrict, query],
  );

  function chooseMunicipality(city: string) {
    setSelectedCity(city);
    onChange({ region: selectedRegion, district: selectedDistrict, city });
    setQuery(city);
    setOpen(false);
    setActiveIndex(-1);
  }

  function onMunicipalityKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!selectedDistrict) return;
    if (event.key === "ArrowDown" && municipalities.length) {
      event.preventDefault(); setOpen(true);
      setActiveIndex((currentIndex) => Math.min(municipalities.length - 1, currentIndex + 1));
    } else if (event.key === "ArrowUp" && municipalities.length) {
      event.preventDefault(); setOpen(true);
      setActiveIndex((currentIndex) => currentIndex <= 0 ? municipalities.length - 1 : currentIndex - 1);
    } else if (event.key === "Enter" && open && activeIndex >= 0 && municipalities[activeIndex]) {
      event.preventDefault(); chooseMunicipality(municipalities[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false); setActiveIndex(-1);
    }
  }

  const requiredMark = required ? <span className="partner-required-mark" aria-hidden="true"> *</span> : null;

  return (
    <div className="partner-location-selector" role="group" aria-label="Lokalita na Slovensku">
      <div className="partner-field">
        <label htmlFor={`${baseId}-region`}>Kraj{requiredMark}</label>
        <select id={`${baseId}-region`} value={selectedRegion} required={required} disabled={disabled}
          aria-invalid={Boolean(errors.region)}
          aria-describedby={errors.region ? regionErrorId : undefined}
          data-field-error={errors.region ? "true" : undefined}
          onChange={(event) => {
            const region = event.target.value;
            setSelectedRegion(region); setSelectedDistrict(""); setSelectedCity("");
            onChange({ region, district: "", city: "" }); setQuery(""); setOpen(false); setActiveIndex(-1);
          }}>
          <option value="">Vyberte kraj</option>
          {SLOVAK_REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}
        </select>
        {errors.region ? <small className="partner-field-error" id={regionErrorId}>{errors.region}</small> : null}
      </div>

      <div className="partner-field">
        <label htmlFor={`${baseId}-district`}>Okres{requiredMark}</label>
        <select id={`${baseId}-district`} value={selectedDistrict} required={required}
          disabled={disabled || !selectedRegion}
          aria-invalid={Boolean(errors.district)}
          aria-describedby={errors.district ? districtErrorId : undefined}
          data-field-error={errors.district ? "true" : undefined}
          onChange={(event) => {
            const district = event.target.value;
            setSelectedDistrict(district); setSelectedCity("");
            onChange({ region: selectedRegion, district, city: "" }); setQuery(""); setOpen(false); setActiveIndex(-1);
          }}>
          <option value="">{selectedRegion ? "Vyberte okres" : "Najprv vyberte kraj"}</option>
          {districts.map((district) => <option key={district} value={district}>{district}</option>)}
        </select>
        {errors.district ? <small className="partner-field-error" id={districtErrorId}>{errors.district}</small> : null}
      </div>

      <div className="partner-field partner-location-municipality">
        <label htmlFor={`${baseId}-municipality`}>Obec / mesto{requiredMark}</label>
        <div className="partner-location-combobox">
          <input id={`${baseId}-municipality`} type="text" role="combobox" autoComplete="off"
            aria-autocomplete="list" aria-expanded={open && Boolean(selectedDistrict)} aria-controls={listboxId}
            aria-activedescendant={open && activeIndex >= 0 ? `${baseId}-municipality-${activeIndex}` : undefined}
            aria-invalid={Boolean(errors.city)}
            aria-describedby={[hintId,statusId,errors.city ? cityErrorId : ""].filter(Boolean).join(" ")}
            data-field-error={errors.city ? "true" : undefined}
            value={query} required={required} disabled={disabled || !selectedDistrict}
            placeholder={selectedDistrict ? "Začnite písať obec alebo mesto" : "Najprv vyberte okres"}
            onFocus={() => { if (selectedDistrict) setOpen(true); }}
            onBlur={() => { setOpen(false); setActiveIndex(-1); if (!selectedCity) setQuery(""); }}
            onChange={(event) => {
              setQuery(event.target.value);
              if (selectedCity) { setSelectedCity(""); onChange({ region: selectedRegion, district: selectedDistrict, city: "" }); }
              setOpen(true); setActiveIndex(-1);
            }}
            onKeyDown={onMunicipalityKeyDown}
          />
          {open && selectedDistrict ? (
            <ul className="partner-location-options" id={listboxId} role="listbox">
              {municipalities.length ? municipalities.map((municipality, index) => (
                <li id={`${baseId}-municipality-${index}`} key={municipality} role="option"
                  aria-selected={selectedCity === municipality} className={activeIndex === index ? "is-active" : undefined}
                  onMouseDown={(event) => event.preventDefault()} onClick={() => chooseMunicipality(municipality)}>
                  {municipality}
                </li>
              )) : <li className="partner-location-empty" role="presentation">Nenašla sa zodpovedajúca obec ani mesto.</li>}
            </ul>
          ) : null}
        </div>
        <small id={hintId}>Vyberte názov zo zoznamu; voľný text sa neuloží.</small>
        {errors.city ? <small className="partner-field-error" id={cityErrorId}>{errors.city}</small> : null}
        <span className="partner-location-sr-status" id={statusId} aria-live="polite">
          {open && selectedDistrict ? `${municipalities.length} možností` : ""}
        </span>
      </div>
    </div>
  );
}
