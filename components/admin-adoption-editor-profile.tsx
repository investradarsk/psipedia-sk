import {
  adoptionActivityLevels,
  adoptionCompatibilityValues,
  adoptionRegions,
  adoptionSexes,
  adoptionSizes,
  type AdoptionDog,
} from "@/lib/adoption";
import type { AdoptionAdminBreedOption } from "@/lib/adoption-admin-write";

const labels = {
  sex: { MALE: "Pes", FEMALE: "Sučka", UNKNOWN: "Neuvedené" },
  size: { SMALL: "Malý", MEDIUM: "Stredný", LARGE: "Veľký", GIANT: "Obrovský", UNKNOWN: "Neuvedená" },
  activity: { LOW: "Nízka", MEDIUM: "Stredná", HIGH: "Vysoká", VERY_HIGH: "Veľmi vysoká", UNKNOWN: "Neuvedená" },
  compatibility: { YES: "Áno", NO: "Nie", CONDITIONAL: "S podmienkami", UNKNOWN: "Neoverené" },
} as const;

export function AdminAdoptionEditorProfile({ item, breeds, publishing }: { item?: AdoptionDog; breeds: AdoptionAdminBreedOption[]; publishing: boolean }) {
  return <>
    <section className="admin-form-card">
      <div className="admin-card-heading"><div><span>02</span><div><h2>Plemeno a profil</h2><p>Vek, pohlavie, veľkosť a fyzické údaje.</p></div></div></div>
      <div className="admin-field-grid">
        <div className="admin-field"><label htmlFor="adoption-breed">Plemeno z databázy</label><select id="adoption-breed" name="breedId" defaultValue={item?.breedId ?? ""}><option value="">Bez väzby / kríženec / neznáme</option>{breeds.map((breed) => <option key={breed.id} value={breed.id}>{breed.name}</option>)}</select></div>
        <div className="admin-field"><label htmlFor="adoption-breed-name">Opis plemena / typ</label><input id="adoption-breed-name" name="breedName" defaultValue={item?.breedName ?? ""} /><small>Pri vybranom breed_id server použije názov z managed_breeds.</small></div>
        <label className="admin-event-cancelled"><input type="checkbox" name="breedMix" defaultChecked={item?.breedMix ?? false}/><span><strong>Kríženec</strong><small>Môže zostať aj bez breed_id.</small></span></label>
        <div className="admin-field"><label htmlFor="adoption-sex">Pohlavie{publishing ? " *" : ""}</label><select id="adoption-sex" name="sex" defaultValue={item?.sex ?? "UNKNOWN"}>{adoptionSexes.map((value) => <option key={value} value={value}>{labels.sex[value]}</option>)}</select></div>
        <div className="admin-field"><label htmlFor="adoption-birth">Dátum narodenia</label><input id="adoption-birth" type="date" name="birthDate" defaultValue={item?.birthDate ?? ""}/></div>
        <div className="admin-field"><label htmlFor="adoption-age">Približný vek v mesiacoch</label><input id="adoption-age" type="number" min="0" max="360" name="approximateAgeMonths" defaultValue={item?.approximateAgeMonths ?? ""}/><small>Použi dátum narodenia alebo približný vek, nie oboje.</small></div>
        <div className="admin-field"><label htmlFor="adoption-size">Veľkosť{publishing ? " *" : ""}</label><select id="adoption-size" name="size" defaultValue={item?.size ?? "UNKNOWN"}>{adoptionSizes.map((value) => <option key={value} value={value}>{labels.size[value]}</option>)}</select></div>
        <div className="admin-field"><label htmlFor="adoption-weight">Hmotnosť (kg)</label><input id="adoption-weight" type="number" min="0" max="500" step="0.1" name="weight" defaultValue={item?.weight ?? ""}/></div>
        <div className="admin-field"><label htmlFor="adoption-color">Farba</label><input id="adoption-color" name="color" defaultValue={item?.color ?? ""}/></div>
        <div className="admin-field"><label htmlFor="adoption-activity">Aktivita</label><select id="adoption-activity" name="activityLevel" defaultValue={item?.activityLevel ?? "UNKNOWN"}>{adoptionActivityLevels.map((value) => <option key={value} value={value}>{labels.activity[value]}</option>)}</select></div>
      </div>
    </section>

    <section className="admin-form-card">
      <div className="admin-card-heading"><div><span>03</span><div><h2>Lokalita</h2><p>Kraj, okres a mesto podľa modelu.</p></div></div></div>
      <div className="admin-field-grid">
        <div className="admin-field"><label htmlFor="adoption-region">Kraj{publishing ? " *" : ""}</label><select id="adoption-region" name="region" defaultValue={item?.region ?? ""}><option value="">Neuvedený</option>{adoptionRegions.map((value) => <option key={value}>{value}</option>)}</select></div>
        <div className="admin-field"><label htmlFor="adoption-district">Okres</label><input id="adoption-district" name="district" defaultValue={item?.district ?? ""}/></div>
        <div className="admin-field"><label htmlFor="adoption-city">Mesto{publishing ? " *" : ""}</label><input id="adoption-city" name="city" defaultValue={item?.city ?? ""} required={publishing}/></div>
      </div>
    </section>

    <section className="admin-form-card">
      <div className="admin-card-heading"><div><span>04</span><div><h2>Povaha a kompatibilita</h2><p>Opis psa a overené vzťahy k domácnosti.</p></div></div></div>
      <div className="admin-field"><label htmlFor="adoption-short">Krátky popis{publishing ? " *" : ""}</label><textarea id="adoption-short" name="shortDescription" rows={3} defaultValue={item?.shortDescription ?? ""} required={publishing}/></div>
      <div className="admin-field"><label htmlFor="adoption-description">Príbeh a podrobný popis{publishing ? " *" : ""}</label><textarea id="adoption-description" name="description" rows={8} defaultValue={item?.description ?? ""} required={publishing}/></div>
      <div className="admin-field"><label htmlFor="adoption-temperament">Povaha</label><textarea id="adoption-temperament" name="temperament" rows={4} defaultValue={item?.temperament ?? ""}/></div>
      <div className="admin-field-grid">
        {[["suitableForChildren","Deti",item?.suitableForChildren],["suitableForDogs","Psy",item?.suitableForDogs],["suitableForCats","Mačky",item?.suitableForCats],["suitableForOtherAnimals","Iné zvieratá",item?.suitableForOtherAnimals]].map(([key,label,value]) => <div className="admin-field" key={String(key)}><label htmlFor={`adoption-${key}`}>{label}</label><select id={`adoption-${key}`} name={String(key)} defaultValue={String(value ?? "UNKNOWN")}>{adoptionCompatibilityValues.map((option) => <option key={option} value={option}>{labels.compatibility[option]}</option>)}</select></div>)}
      </div>
      <div className="admin-field-grid">
        {[["apartmentSuitable","Vhodný do bytu",item?.apartmentSuitable],["beginnerSuitable","Pre začiatočníka",item?.beginnerSuitable]].map(([key,label,value]) => <div className="admin-field" key={String(key)}><label htmlFor={`adoption-${key}`}>{label}</label><select id={`adoption-${key}`} name={String(key)} defaultValue={value === true ? "true" : value === false ? "false" : ""}><option value="">Neoverené</option><option value="true">Áno</option><option value="false">Nie</option></select></div>)}
        <label className="admin-event-cancelled"><input type="checkbox" name="needsExperiencedOwner" defaultChecked={item?.needsExperiencedOwner ?? false}/><span><strong>Potrebuje skúseného majiteľa</strong></span></label>
      </div>
    </section>
  </>;
}
