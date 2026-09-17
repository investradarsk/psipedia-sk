import type { ChangeEvent } from "react";
import { adoptionVaccinationStatuses, type AdoptionDog } from "@/lib/adoption";
import type { AdoptionAdminOrganizationOption } from "@/lib/adoption-admin-write";

const vaccinationLabels = { UNKNOWN: "Neuvedené", NONE: "Nie", PARTIAL: "Čiastočne", UP_TO_DATE: "Aktuálne" } as const;
const triState = (value: boolean | null | undefined) => value === true ? "true" : value === false ? "false" : "";
const dateInput = (value: string | null | undefined) => value ? value.slice(0, 10) : "";

export function AdminAdoptionEditorDetails({
  item,
  organizations,
  publishing,
  mainImage,
  uploading,
  onMainImageChange,
  onUpload,
}: {
  item?: AdoptionDog;
  organizations: AdoptionAdminOrganizationOption[];
  publishing: boolean;
  mainImage: string;
  uploading: boolean;
  onMainImageChange: (value: string) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return <>
    <section className="admin-form-card">
      <div className="admin-card-heading"><div><span>05</span><div><h2>Zdravie</h2><p>Uvádzaj iba známe údaje.</p></div></div></div>
      <div className="admin-field-grid">
        <div className="admin-field"><label htmlFor="adoption-vaccination">Očkovanie</label><select id="adoption-vaccination" name="vaccinationStatus" defaultValue={item?.vaccinationStatus ?? "UNKNOWN"}>{adoptionVaccinationStatuses.map((value) => <option key={value} value={value}>{vaccinationLabels[value]}</option>)}</select></div>
        {[ ["chipped","Čip",item?.chipped], ["neutered","Kastrácia",item?.neutered] ].map(([key,label,value]) => <div className="admin-field" key={String(key)}><label htmlFor={`adoption-${key}`}>{label}</label><select id={`adoption-${key}`} name={String(key)} defaultValue={triState(value as boolean | null | undefined)}><option value="">Neuvedené</option><option value="true">Áno</option><option value="false">Nie</option></select></div>)}
      </div>
      <div className="admin-field"><label htmlFor="adoption-health">Zdravotné poznámky</label><textarea id="adoption-health" name="healthNotes" rows={4} defaultValue={item?.healthNotes ?? ""}/></div>
      <div className="admin-field"><label htmlFor="adoption-special">Špeciálne potreby</label><textarea id="adoption-special" name="specialNeeds" rows={3} defaultValue={item?.specialNeeds ?? ""}/></div>
      <div className="admin-field"><label htmlFor="adoption-requirements">Podmienky adopcie</label><textarea id="adoption-requirements" name="adoptionRequirements" rows={4} defaultValue={item?.adoptionRequirements ?? ""}/></div>
    </section>

    <section className="admin-form-card">
      <div className="admin-card-heading"><div><span>06</span><div><h2>Organizácia a kontakt</h2><p>Canonical väzba je autoritatívna cez organization_id; snapshot polia ostávajú iba pre kompatibilitu.</p></div></div></div>
      <div className="admin-field-grid">
        <div className="admin-field"><label htmlFor="adoption-organization-id">Canonical organizácia{publishing ? " *" : ""}</label><select id="adoption-organization-id" name="organizationId" defaultValue={item?.organizationId ?? ""} required={publishing}><option value="">Bez canonical väzby</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select><small>Pri vybranej organizácii server vždy odvodí názov a slug z help_organizations.</small></div>
        <div className="admin-field"><label htmlFor="adoption-organization">Compatibility snapshot / zodpovedná osoba</label><input id="adoption-organization" name="organizationName" defaultValue={item?.organizationName ?? ""}/><small>Pri organization_id sa táto hodnota nepoužíva ako zdroj identity.</small></div>
        <div className="admin-field"><label htmlFor="adoption-org-slug">Compatibility snapshot slug</label><input id="adoption-org-slug" name="organizationSlug" defaultValue={item?.organizationSlug ?? ""}/></div>
        <div className="admin-field"><label htmlFor="adoption-email">E-mail</label><input id="adoption-email" type="email" name="contactEmail" defaultValue={item?.contactEmail ?? ""}/></div>
        <div className="admin-field"><label htmlFor="adoption-phone">Telefón</label><input id="adoption-phone" name="contactPhone" defaultValue={item?.contactPhone ?? ""}/></div>
        <div className="admin-field"><label htmlFor="adoption-contact-url">Kontaktný odkaz</label><input id="adoption-contact-url" type="url" name="contactUrl" defaultValue={item?.contactUrl ?? ""}/></div>
        <div className="admin-field"><label htmlFor="adoption-source-url">Pôvodný zdroj</label><input id="adoption-source-url" type="url" name="externalSourceUrl" defaultValue={item?.externalSourceUrl ?? ""}/></div>
      </div>
    </section>

    <section className="admin-form-card">
      <div className="admin-card-heading"><div><span>07</span><div><h2>Fotografie</h2><p>Hlavná fotografia a galéria používajú existujúce URL polia modelu.</p></div></div></div>
      <div className="admin-field"><label htmlFor="adoption-main-image">Hlavný obrázok{publishing ? " *" : ""}</label><input id="adoption-main-image" value={mainImage} onChange={(event: ChangeEvent<HTMLInputElement>) => onMainImageChange(event.target.value)} placeholder="/media/... alebo https://..." required={publishing}/></div>
      <div className="admin-upload-actions"><label className="admin-upload-button"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={onUpload} disabled={uploading}/>{uploading ? "Nahrávam…" : "Nahrať hlavnú fotografiu"}</label>{mainImage && <button type="button" onClick={() => onMainImageChange("")}>Odstrániť z profilu</button>}</div>
      <div className="admin-field"><label htmlFor="adoption-gallery">Galéria</label><textarea id="adoption-gallery" name="gallery" rows={5} defaultValue={item?.gallery.join("\n") ?? ""} placeholder="Jedna URL na riadok"/></div>
    </section>

    <section className="admin-form-card">
      <div className="admin-card-heading"><div><span>08</span><div><h2>Stav a overenie</h2><p>search_text, published_at a indexability spravuje server.</p></div></div></div>
      <div className="admin-field"><label htmlFor="adoption-verified">Posledné overenie{publishing ? " *" : ""}</label><input id="adoption-verified" type="date" name="lastVerifiedAt" defaultValue={dateInput(item?.lastVerifiedAt)} required={publishing}/></div>
    </section>
  </>;
}
