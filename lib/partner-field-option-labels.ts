/** Only the text shown to partners changes; API/SQL enum values stay intact. */
const labels: Readonly<Record<string,string>> = {
  UNKNOWN:"Neviem", YES:"Áno", NO:"Nie", CONDITIONAL:"Podmienečne",
  MALE:"Pes", FEMALE:"Suka",
  SMALL:"Malý", MEDIUM:"Stredný", LARGE:"Veľký", GIANT:"Obrovský",
  LOW:"Nízka", HIGH:"Vysoká", VERY_HIGH:"Veľmi vysoká",
  NONE:"Žiadne", PARTIAL:"Čiastočné", UP_TO_DATE:"Aktuálne",
  LOST:"Stratený pes", FOUND:"Nájdený pes",
  MUNICIPALITY:"Obec alebo mesto", NEIGHBORHOOD:"Mestská časť", APPROXIMATE:"Približná oblasť",
  SHELTER:"Útulok", CIVIC_ASSOCIATION:"Občianske združenie",
  RESCUE_ORGANIZATION:"Záchranná organizácia", MUNICIPAL_ORGANIZATION:"Mestská alebo obecná organizácia",
  NONPROFIT:"Nezisková organizácia", OTHER:"Iné",
  "docasna-opatera":"Dočasná opatera", zbierky:"Zbierka",
  dobrovolnictvo:"Dobrovoľníctvo", "urgentne-pripady":"Urgentný prípad",
  yes:"Áno", no:"Nie", unknown:"Neviem",
  ambulance:"Ambulancia", clinic:"Klinika", hospital:"Nemocnica",
};

export function partnerFieldOptionLabel(value:string):string {
  return labels[value] ?? value;
}
