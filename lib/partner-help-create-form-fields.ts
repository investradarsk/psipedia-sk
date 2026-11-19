import type { PartnerHelpCreateType } from "@/lib/partner-help-create";

export type Field = { key: string; label: string; required?: boolean; kind?: "textarea" | "select" | "date" | "number"; options?: readonly { value: string; label: string }[] };
const sex = [{value:"UNKNOWN",label:"Neviem"}, {value:"MALE",label:"Pes"}, {value:"FEMALE",label:"Suka"}];
const size = [{value:"UNKNOWN",label:"Neviem"}, {value:"SMALL",label:"Malý"}, {value:"MEDIUM",label:"Stredný"}, {value:"LARGE",label:"Veľký"}];
export const specs: Record<PartnerHelpCreateType, readonly Field[]> = {
  ADOPTION_DOG: [
    {key:"name",label:"Meno psa",required:true}, {key:"sex",label:"Pohlavie",kind:"select",options:sex},
    {key:"size",label:"Veľkosť",kind:"select",options:[...size,{value:"GIANT",label:"Obrovský"}]},
    {key:"approximateAgeMonths",label:"Približný vek (mesiace)",kind:"number"},
    {key:"breedName",label:"Plemeno"}, {key:"region",label:"Kraj"}, {key:"district",label:"Okres"},
    {key:"city",label:"Obec / mesto",required:true}, {key:"organizationName",label:"Organizácia"},
    {key:"shortDescription",label:"Krátky opis",required:true,kind:"textarea"},
    {key:"description",label:"Podrobný opis psa",required:true,kind:"textarea"},
  ],
  LOST_FOUND_DOG: [
    {key:"type",label:"Typ hlásenia",kind:"select",required:true,options:[{value:"LOST",label:"Stratený pes"},{value:"FOUND",label:"Nájdený pes"}]},
    {key:"dogName",label:"Meno (ak je známe)"},{key:"sex",label:"Pohlavie",kind:"select",options:sex},
    {key:"breed",label:"Plemeno"},{key:"color",label:"Farba"},{key:"size",label:"Veľkosť",kind:"select",options:size},
    {key:"eventDate",label:"Dátum straty / nálezu",kind:"date",required:true},
    {key:"region",label:"Kraj"},{key:"district",label:"Okres"},{key:"city",label:"Obec / mesto",required:true},
    {key:"locationDescription",label:"Kde sa pes stratil alebo našiel",required:true,kind:"textarea"},
    {key:"description",label:"Opis udalosti a rozpoznávacie znaky",required:true,kind:"textarea"},
  ],
  HELP_CASE: [
    {key:"category",label:"Druh pomoci",kind:"select",required:true,options:[
      {value:"docasna-opatera",label:"Dočasná opatera"},{value:"zbierky",label:"Zbierka"},
      {value:"dobrovolnictvo",label:"Dobrovoľníctvo"},{value:"urgentne-pripady",label:"Urgentný prípad"},
    ]},
    {key:"title",label:"Názov výzvy",required:true}, {key:"excerpt",label:"Stručný opis",kind:"textarea",required:true},
    {key:"description",label:"Podrobnosti o pomoci",kind:"textarea",required:true},
    {key:"organization",label:"Organizácia"}, {key:"region",label:"Kraj"},{key:"city",label:"Obec / mesto",required:true},
    {key:"actionLabel",label:"Text výzvy (napr. Kontaktujte nás)",required:true},
    {key:"contactNote",label:"Verejná kontaktná poznámka",kind:"textarea"},
  ],
};
export const defaults: Record<PartnerHelpCreateType, Record<string,string>> = {
  ADOPTION_DOG: {sex:"UNKNOWN",size:"UNKNOWN"},
  LOST_FOUND_DOG: {type:"LOST",sex:"UNKNOWN",size:"UNKNOWN"},
  HELP_CASE: {category:"docasna-opatera"},
};
export const names: Record<PartnerHelpCreateType,string> = {
  ADOPTION_DOG:"Adopcia psa",LOST_FOUND_DOG:"Stratený / nájdený pes",HELP_CASE:"Ostatná pomoc psom",
};

