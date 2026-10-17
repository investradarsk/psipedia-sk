/**
 * SERVICE CATALOG V0.2 / PHASE 1 — owner-approved static contract only.
 * No runtime activation, writes, Gemini/Notion sync, D1, UI, map or SEO changes.
 */
import {directoryFilterRegistry,getDirectoryFilterDefinition,normalizeDirectoryFilterValue,serviceFilterCategories} from "./directory-filter-contract.ts";
import type {ServiceFilterCategory} from "./directory-filter-contract.ts";
export const SERVICE_CATALOG_VERSION="0.2" as const;
export const SERVICE_SELECTION_POLICY={defaultMode:"all",supportedModes:["all","any"]} as const;
export const TRI_STATE_VALUES=["yes","no","unknown"] as const;
export type ServiceDefinition=Readonly<{id:string;label:string;categories:readonly ServiceFilterCategory[];group:string;aliases:readonly string[];meaning:string}>;
export type PropertyDefinition=Readonly<{id:string;label:string;categories:readonly ServiceFilterCategory[];valueKind:"tri_state"|"single_select"|"multi_select"|"text_list";allowedValues:readonly string[];meaning:string}>;
export type LegacyFacetMapping=Readonly<{legacyId:string;targetId:string;targetKind:"service"|"attribute"|"provider";mode:"lossless_explicit_only"}>;

export const serviceCatalog:readonly ServiceDefinition[]=[
  {
    "id": "svc.vet.preventive_exam",
    "label": "Preventívne vyšetrenie",
    "categories": [
      "veterinari"
    ],
    "group": "Prevencia",
    "aliases": [
      "Preventívna prehliadka",
      "Preventívne prehliadky"
    ],
    "meaning": "Rutinné preventívne vyšetrenie, nie odborná špecializácia."
  },
  {
    "id": "svc.vet.vaccination",
    "label": "Očkovanie",
    "categories": [
      "veterinari"
    ],
    "group": "Prevencia",
    "aliases": [
      "Vakcinácia"
    ],
    "meaning": "Vykonané očkovanie."
  },
  {
    "id": "svc.vet.parasite_care",
    "label": "Antiparazitárna starostlivosť",
    "categories": [
      "veterinari"
    ],
    "group": "Prevencia",
    "aliases": [],
    "meaning": "Zastrešujúca starostlivosť, neimplikuje jednotlivé preparáty."
  },
  {
    "id": "svc.vet.microchipping",
    "label": "Čipovanie",
    "categories": [
      "veterinari"
    ],
    "group": "Prevencia",
    "aliases": [
      "Označenie mikročipom"
    ],
    "meaning": "Označenie psa čipom."
  },
  {
    "id": "svc.vet.pet_passport",
    "label": "Vystavenie pet pasu",
    "categories": [
      "veterinari"
    ],
    "group": "Prevencia",
    "aliases": [
      "Pas spoločenského zvieraťa"
    ],
    "meaning": "Vystavenie pet pasu, nie akéhokoľvek potvrdenia."
  },
  {
    "id": "svc.vet.internal_exam",
    "label": "Interné vyšetrenie",
    "categories": [
      "veterinari"
    ],
    "group": "Vyšetrenia",
    "aliases": [],
    "meaning": "Konkrétne interné vyšetrenie, nie všeobecná špecializácia interná medicína."
  },
  {
    "id": "svc.vet.laboratory",
    "label": "Laboratórne vyšetrenia",
    "categories": [
      "veterinari"
    ],
    "group": "Diagnostika",
    "aliases": [
      "Laboratórna diagnostika"
    ],
    "meaning": "Neznamená automaticky dostupnosť jednotlivých testov."
  },
  {
    "id": "svc.vet.xray",
    "label": "RTG vyšetrenie",
    "categories": [
      "veterinari"
    ],
    "group": "Diagnostika",
    "aliases": [
      "RTG",
      "Röntgenové vyšetrenie"
    ],
    "meaning": "Röntgen nie je CT ani MRI."
  },
  {
    "id": "svc.vet.ultrasound",
    "label": "Ultrazvukové vyšetrenie",
    "categories": [
      "veterinari"
    ],
    "group": "Diagnostika",
    "aliases": [
      "USG",
      "Ultrasonografia",
      "Ultrazvuk"
    ],
    "meaning": "Ultrazvuk nie je EKG alebo CT."
  },
  {
    "id": "svc.vet.ct",
    "label": "CT vyšetrenie",
    "categories": [
      "veterinari"
    ],
    "group": "Diagnostika",
    "aliases": [
      "CT",
      "Počítačová tomografia"
    ],
    "meaning": "CT musí byť výslovne potvrdené."
  },
  {
    "id": "svc.vet.mri",
    "label": "Magnetická rezonancia",
    "categories": [
      "veterinari"
    ],
    "group": "Diagnostika",
    "aliases": [
      "MRI",
      "MR vyšetrenie"
    ],
    "meaning": "MRI sa neodvodzuje z CT."
  },
  {
    "id": "svc.vet.ecg",
    "label": "EKG vyšetrenie",
    "categories": [
      "veterinari"
    ],
    "group": "Diagnostika",
    "aliases": [
      "EKG",
      "Elektrokardiografia"
    ],
    "meaning": "Konkrétne EKG, nie všeobecná kardiológia."
  },
  {
    "id": "svc.vet.endoscopy",
    "label": "Endoskopické vyšetrenie",
    "categories": [
      "veterinari"
    ],
    "group": "Diagnostika",
    "aliases": [
      "Endoskopia"
    ],
    "meaning": "Konkrétna endoskopia, nie ľubovoľná diagnostika."
  },
  {
    "id": "svc.vet.soft_tissue_surgery",
    "label": "Chirurgia mäkkých tkanív",
    "categories": [
      "veterinari"
    ],
    "group": "Chirurgia",
    "aliases": [],
    "meaning": "Všeobecná chirurgia nie je dôkazom tohto výkonu."
  },
  {
    "id": "svc.vet.orthopedic_surgery",
    "label": "Ortopedické operácie",
    "categories": [
      "veterinari"
    ],
    "group": "Chirurgia",
    "aliases": [
      "Ortopedická chirurgia"
    ],
    "meaning": "Operácie, nie všeobecné ortopedické vyšetrenia."
  },
  {
    "id": "svc.vet.neutering",
    "label": "Kastrácia",
    "categories": [
      "veterinari"
    ],
    "group": "Chirurgia",
    "aliases": [
      "Kastrácie"
    ],
    "meaning": "Kastrácia sa neodvodzuje zo všeobecnej chirurgie."
  },
  {
    "id": "svc.vet.dentistry",
    "label": "Veterinárna stomatológia",
    "categories": [
      "veterinari"
    ],
    "group": "Ošetrenia",
    "aliases": [
      "Stomatológia zvierat"
    ],
    "meaning": "Ošetrenia zubov, nie automaticky všetky techniky."
  },
  {
    "id": "svc.vet.hospitalization",
    "label": "Hospitalizácia",
    "categories": [
      "veterinari"
    ],
    "group": "Pobytová starostlivosť",
    "aliases": [],
    "meaning": "Pobyt pacienta neimplikuje intenzívnu starostlivosť."
  },
  {
    "id": "svc.vet.intensive_care",
    "label": "Intenzívna veterinárna starostlivosť",
    "categories": [
      "veterinari"
    ],
    "group": "Pobytová starostlivosť",
    "aliases": [],
    "meaning": "Samostatne deklarovaná intenzívna starostlivosť."
  },
  {
    "id": "svc.vet.reproductive_diagnostics",
    "label": "Reprodukčná diagnostika",
    "categories": [
      "veterinari"
    ],
    "group": "Vyšetrenia",
    "aliases": [],
    "meaning": "Nie automaticky všetky reprodukčné testy."
  },
  {
    "id": "svc.training.puppy_education",
    "label": "Výchova šteniat",
    "categories": [
      "treneri",
      "kynologicke-kluby"
    ],
    "group": "Výcvik",
    "aliases": [
      "Kurz šteniat"
    ],
    "meaning": "Výchova šteniat, nie automaticky výcvik dospelých."
  },
  {
    "id": "svc.training.basic_obedience",
    "label": "Základná poslušnosť",
    "categories": [
      "treneri",
      "kynologicke-kluby"
    ],
    "group": "Výcvik",
    "aliases": [
      "Základný výcvik"
    ],
    "meaning": "Nie automaticky príprava na skúšky."
  },
  {
    "id": "svc.training.behavior",
    "label": "Riešenie problémového správania",
    "categories": [
      "treneri"
    ],
    "group": "Výcvik",
    "aliases": [
      "Prevýchova problémového správania"
    ],
    "meaning": "Tréning, nie veterinárna behaviorálna diagnostika."
  },
  {
    "id": "svc.training.socialization",
    "label": "Socializačné tréningy",
    "categories": [
      "treneri",
      "kynologicke-kluby"
    ],
    "group": "Výcvik",
    "aliases": [
      "Socializačné lekcie"
    ],
    "meaning": "Socializačné prechádzky vyžadujú overenie rovnakého významu."
  },
  {
    "id": "svc.training.agility",
    "label": "Tréning agility",
    "categories": [
      "treneri",
      "kynologicke-kluby"
    ],
    "group": "Psie športy",
    "aliases": [
      "Agility",
      "Agility tréning"
    ],
    "meaning": "Jediné globálne ID pre trénerov aj kluby."
  },
  {
    "id": "svc.training.rally_obedience",
    "label": "Rally obedience",
    "categories": [
      "treneri",
      "kynologicke-kluby"
    ],
    "group": "Psie športy",
    "aliases": [
      "Rally-O"
    ],
    "meaning": "Nie synonymum základnej poslušnosti."
  },
  {
    "id": "svc.training.nosework",
    "label": "Nosework",
    "categories": [
      "treneri"
    ],
    "group": "Psie športy",
    "aliases": [],
    "meaning": "Bežné čuchové hry nie sú automaticky nosework."
  },
  {
    "id": "svc.training.show_handling",
    "label": "Výstavný handling",
    "categories": [
      "treneri"
    ],
    "group": "Výcvik",
    "aliases": [
      "Handling psov"
    ],
    "meaning": "Nie výstavná úprava srsti."
  },
  {
    "id": "svc.training.exam_preparation",
    "label": "Príprava na skúšky",
    "categories": [
      "treneri",
      "kynologicke-kluby"
    ],
    "group": "Výcvik",
    "aliases": [
      "Príprava na skúšky výkonu"
    ],
    "meaning": "Nie organizovanie skúšok."
  },
  {
    "id": "svc.training.residential_training",
    "label": "Pobytový výcvik",
    "categories": [
      "treneri",
      "hotely-a-opatrovanie"
    ],
    "group": "Výcvik",
    "aliases": [
      "Internátny výcvik"
    ],
    "meaning": "Výcvik s pobytom, nie samotné ubytovanie."
  },
  {
    "id": "svc.training.tracking",
    "label": "Stopársky výcvik",
    "categories": [
      "kynologicke-kluby"
    ],
    "group": "Psie športy",
    "aliases": [
      "Výcvik stôp"
    ],
    "meaning": "Nie každá čuchová aktivita."
  },
  {
    "id": "svc.training.protection",
    "label": "Obranný výcvik",
    "categories": [
      "kynologicke-kluby"
    ],
    "group": "Psie športy",
    "aliases": [
      "Výcvik obrán"
    ],
    "meaning": "Nie všeobecný výcvik poslušnosti."
  },
  {
    "id": "svc.training.igp",
    "label": "Výcvik IGP",
    "categories": [
      "kynologicke-kluby"
    ],
    "group": "Psie športy",
    "aliases": [
      "IGP"
    ],
    "meaning": "Športová kynológia nie je dôkazom IGP."
  },
  {
    "id": "svc.breeding.advice",
    "label": "Chovateľské poradenstvo",
    "categories": [
      "chovatelske-kluby",
      "chovatelske-stanice"
    ],
    "group": "Chov",
    "aliases": [],
    "meaning": "Samostatne potvrdená ponuka, nie len charakter chovu."
  },
  {
    "id": "svc.breeding.administration",
    "label": "Administrácia chovu",
    "categories": [
      "chovatelske-kluby"
    ],
    "group": "Chov",
    "aliases": [
      "Chovateľská agenda"
    ],
    "meaning": "Poskytovaná agenda, nie iba dokument s chovnými podmienkami."
  },
  {
    "id": "svc.breeding.eligibility",
    "label": "Posudzovanie chovnej spôsobilosti",
    "categories": [
      "chovatelske-kluby"
    ],
    "group": "Chov",
    "aliases": [
      "Posúdenie chovnosti"
    ],
    "meaning": "Samostatne vykonávané posúdenie, nie zoznam chovných jedincov."
  },
  {
    "id": "svc.groom.haircut",
    "label": "Strihanie srsti",
    "categories": [
      "salony-a-sluzby"
    ],
    "group": "Úprava srsti",
    "aliases": [
      "Strihanie psov"
    ],
    "meaning": "Strihanie nie je trimovanie."
  },
  {
    "id": "svc.groom.bathing",
    "label": "Kúpanie psov",
    "categories": [
      "salony-a-sluzby"
    ],
    "group": "Úprava srsti",
    "aliases": [],
    "meaning": "Nie hydroterapia."
  },
  {
    "id": "svc.groom.brushing",
    "label": "Vyčesávanie srsti",
    "categories": [
      "salony-a-sluzby"
    ],
    "group": "Úprava srsti",
    "aliases": [
      "Rozčesávanie srsti"
    ],
    "meaning": "Nie automaticky strihanie."
  },
  {
    "id": "svc.groom.stripping",
    "label": "Trimovanie",
    "categories": [
      "salony-a-sluzby"
    ],
    "group": "Úprava srsti",
    "aliases": [
      "Hand stripping",
      "Ručné trimovanie"
    ],
    "meaning": "Nie strihanie srsti."
  },
  {
    "id": "svc.groom.nails",
    "label": "Strihanie pazúrov",
    "categories": [
      "salony-a-sluzby",
      "veterinari"
    ],
    "group": "Hygiena",
    "aliases": [
      "Skracovanie pazúrov"
    ],
    "meaning": "Vo veterinárnej kategórii iba výslovne potvrdená ponuka."
  },
  {
    "id": "svc.groom.ears",
    "label": "Hygienické čistenie uší",
    "categories": [
      "salony-a-sluzby"
    ],
    "group": "Hygiena",
    "aliases": [
      "Čistenie uší"
    ],
    "meaning": "Nie liečba ochorenia uší."
  },
  {
    "id": "svc.groom.show_grooming",
    "label": "Výstavná úprava srsti",
    "categories": [
      "salony-a-sluzby"
    ],
    "group": "Úprava srsti",
    "aliases": [
      "Výstavný grooming"
    ],
    "meaning": "Nie výstavný handling."
  },
  {
    "id": "svc.care.boarding",
    "label": "Ubytovanie psov",
    "categories": [
      "hotely-a-opatrovanie"
    ],
    "group": "Opatrovanie",
    "aliases": [
      "Nočné ubytovanie",
      "Ubytovanie s prenocovaním"
    ],
    "meaning": "Prenocovanie v zariadení, nie nepretržitý osobný dohľad."
  },
  {
    "id": "svc.care.daycare",
    "label": "Denná opatera",
    "categories": [
      "hotely-a-opatrovanie"
    ],
    "group": "Opatrovanie",
    "aliases": [
      "Denná starostlivosť o psy"
    ],
    "meaning": "Psia škôlka je synonymom len po potvrdení rovnakého rozsahu."
  },
  {
    "id": "svc.care.provider_home",
    "label": "Domáca opatera",
    "categories": [
      "hotely-a-opatrovanie"
    ],
    "group": "Opatrovanie",
    "aliases": [
      "Opatera u poskytovateľa"
    ],
    "meaning": "U poskytovateľa, nie u majiteľa."
  },
  {
    "id": "svc.care.owner_home",
    "label": "Opatrovanie v domácnosti majiteľa",
    "categories": [
      "hotely-a-opatrovanie"
    ],
    "group": "Opatrovanie",
    "aliases": [
      "Stráženie u majiteľa"
    ],
    "meaning": "Súvislá opatera u majiteľa, nie krátka návšteva."
  },
  {
    "id": "svc.care.home_visit",
    "label": "Návštevná starostlivosť",
    "categories": [
      "hotely-a-opatrovanie",
      "vencenie"
    ],
    "group": "Opatrovanie",
    "aliases": [
      "Návštevy psa"
    ],
    "meaning": "Jednotlivé návštevy, nie súvislá opatera ani veterinárny výjazd."
  },
  {
    "id": "svc.walk.individual",
    "label": "Individuálne venčenie",
    "categories": [
      "vencenie",
      "hotely-a-opatrovanie"
    ],
    "group": "Venčenie",
    "aliases": [],
    "meaning": "Samostatná ponuka, nie len hotelové venčenie v cene pobytu."
  },
  {
    "id": "svc.walk.group",
    "label": "Skupinové venčenie",
    "categories": [
      "vencenie",
      "hotely-a-opatrovanie"
    ],
    "group": "Venčenie",
    "aliases": [],
    "meaning": "Samostatná ponuka, nie hotelová aktivita v rámci pobytu."
  },
  {
    "id": "svc.physio.assessment",
    "label": "Fyzioterapeutické vyšetrenie",
    "categories": [
      "fyzioterapia"
    ],
    "group": "Fyzioterapia",
    "aliases": [],
    "meaning": "Vstupné posúdenie nie je terapia."
  },
  {
    "id": "svc.physio.rehabilitation",
    "label": "Rehabilitačná terapia",
    "categories": [
      "fyzioterapia",
      "veterinari"
    ],
    "group": "Fyzioterapia",
    "aliases": [
      "Rehabilitácia psov"
    ],
    "meaning": "Ortopedické a neurologické zameranie sú vlastnosti."
  },
  {
    "id": "svc.physio.hydrotherapy",
    "label": "Hydroterapia",
    "categories": [
      "fyzioterapia",
      "veterinari"
    ],
    "group": "Fyzioterapia",
    "aliases": [
      "Vodná terapia"
    ],
    "meaning": "Liečebná vodná terapia, nie kúpanie psa."
  },
  {
    "id": "svc.physio.electrotherapy",
    "label": "Elektroterapia",
    "categories": [
      "fyzioterapia"
    ],
    "group": "Fyzioterapia",
    "aliases": [],
    "meaning": "Nie laserterapia."
  },
  {
    "id": "svc.physio.lasertherapy",
    "label": "Laserterapia",
    "categories": [
      "fyzioterapia"
    ],
    "group": "Fyzioterapia",
    "aliases": [],
    "meaning": "Výslovne potvrdená metóda."
  },
  {
    "id": "svc.physio.manualtherapy",
    "label": "Manuálna terapia",
    "categories": [
      "fyzioterapia"
    ],
    "group": "Fyzioterapia",
    "aliases": [
      "Manuálne techniky"
    ],
    "meaning": "Dornovu metódu treba potvrdiť osobitne."
  },
  {
    "id": "svc.physio.exercise",
    "label": "Terapeutické cvičenie",
    "categories": [
      "fyzioterapia"
    ],
    "group": "Fyzioterapia",
    "aliases": [
      "Rehabilitačné cvičenia"
    ],
    "meaning": "Bežný dogfitness sa nepriraďuje automaticky."
  },
  {
    "id": "svc.physio.dorn",
    "label": "Dornova metóda",
    "categories": [
      "fyzioterapia"
    ],
    "group": "Fyzioterapia",
    "aliases": [],
    "meaning": "Výslovne potvrdená metóda."
  },
  {
    "id": "svc.transport.dogs",
    "label": "Preprava psov",
    "categories": [
      "dalsie-sluzby"
    ],
    "group": "Preprava",
    "aliases": [
      "Transport psov"
    ],
    "meaning": "Pet taxi ani medzinárodná preprava sa neodvodzujú."
  },
  {
    "id": "svc.transport.pet_taxi",
    "label": "Pet taxi",
    "categories": [
      "dalsie-sluzby"
    ],
    "group": "Preprava",
    "aliases": [
      "Taxi pre zvieratá"
    ],
    "meaning": "Odlišný režim od všeobecnej dopravy."
  },
  {
    "id": "svc.other.photography",
    "label": "Fotografovanie psov",
    "categories": [
      "dalsie-sluzby"
    ],
    "group": "Ostatné",
    "aliases": [
      "Fotenie psov"
    ],
    "meaning": "Fotografická služba, nie iba predaj obrázkov."
  },
  {
    "id": "svc.other.nutrition",
    "label": "Výživové poradenstvo",
    "categories": [
      "dalsie-sluzby"
    ],
    "group": "Ostatné",
    "aliases": [],
    "meaning": "Nie predaj krmiva."
  },
  {
    "id": "svc.other.custom_equipment",
    "label": "Výroba výbavy na mieru",
    "categories": [
      "dalsie-sluzby"
    ],
    "group": "Ostatné",
    "aliases": [
      "Zákazková výroba výbavy pre psov"
    ],
    "meaning": "Nie predaj hotovej výbavy."
  },
  {
    "id": "svc.other.equipment_rental",
    "label": "Požičiavanie výbavy",
    "categories": [
      "dalsie-sluzby"
    ],
    "group": "Ostatné",
    "aliases": [
      "Prenájom výbavy"
    ],
    "meaning": "Prenájom nie je predaj."
  },
  {
    "id": "svc.other.cremation",
    "label": "Kremácia spoločenských zvierat",
    "categories": [
      "dalsie-sluzby"
    ],
    "group": "Ostatné",
    "aliases": [],
    "meaning": "Nie automaticky preprava tela."
  }
];
export const attributeCatalog:readonly PropertyDefinition[]=[
  {
    "id": "attr.vet.emergency",
    "label": "Pohotovosť",
    "categories": [
      "veterinari"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Nie automaticky 24/7."
  },
  {
    "id": "attr.vet.open_24_7",
    "label": "Nepretržitá prevádzka",
    "categories": [
      "veterinari"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Nie automaticky špecializovaná pohotovosť."
  },
  {
    "id": "attr.vet.home_visits",
    "label": "Veterinárne návštevy doma",
    "categories": [
      "veterinari"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Nie návštevné opatrovanie."
  },
  {
    "id": "attr.training.individual_mode",
    "label": "Individuálna forma výcviku",
    "categories": [
      "treneri",
      "kynologicke-kluby"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Forma výcviku, nie ďalšia služba."
  },
  {
    "id": "attr.training.group_mode",
    "label": "Skupinová forma výcviku",
    "categories": [
      "treneri",
      "kynologicke-kluby"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Jedna spoločná vlastnosť trénerov a klubov."
  },
  {
    "id": "attr.breedclub.member_events",
    "label": "Klubové podujatia",
    "categories": [
      "chovatelske-kluby"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Organizovanie, nie len účasť."
  },
  {
    "id": "attr.breedclub.breeds",
    "label": "Zastrešované plemená",
    "categories": [
      "chovatelske-kluby"
    ],
    "valueKind": "text_list",
    "allowedValues": [],
    "meaning": "Plemená nie sú služby."
  },
  {
    "id": "attr.kennel.visits_by_appointment",
    "label": "Návštevy po dohode",
    "categories": [
      "chovatelske-stanice"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Dostupnosť návštev."
  },
  {
    "id": "attr.kennel.health_testing_information",
    "label": "Informácie o zdravotných testoch",
    "categories": [
      "chovatelske-stanice"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Nie samotné vykonávanie testov."
  },
  {
    "id": "attr.kennel.breeding_focus",
    "label": "Zameranie chovu",
    "categories": [
      "chovatelske-stanice"
    ],
    "valueKind": "multi_select",
    "allowedValues": [
      "working",
      "show",
      "sport",
      "family",
      "hunting",
      "guard",
      "service",
      "other"
    ],
    "meaning": "Charakter chovu nie je služba."
  },
  {
    "id": "attr.kennel.litter_status",
    "label": "Stav vrhov",
    "categories": [
      "chovatelske-stanice"
    ],
    "valueKind": "single_select",
    "allowedValues": [
      "available",
      "planned",
      "none",
      "unknown"
    ],
    "meaning": "Časovo citlivý údaj vyžaduje dátum potvrdenia."
  },
  {
    "id": "attr.groom.mobile",
    "label": "Mobilný salón",
    "categories": [
      "salony-a-sluzby"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Služba u zákazníka."
  },
  {
    "id": "attr.groom.complete_package",
    "label": "Kompletný balík úpravy",
    "categories": [
      "salony-a-sluzby"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Balík nenahrádza jednotlivé služby."
  },
  {
    "id": "attr.care.year_round",
    "label": "Celoročná prevádzka",
    "categories": [
      "hotely-a-opatrovanie"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Prevádzková dostupnosť."
  },
  {
    "id": "attr.care.supervision_mode",
    "label": "Režim dohľadu",
    "categories": [
      "hotely-a-opatrovanie"
    ],
    "valueKind": "single_select",
    "allowedValues": [
      "overnight_checks",
      "night_presence",
      "continuous_presence",
      "unknown"
    ],
    "meaning": "Nočné kontroly, osobná nočná a nepretržitá prítomnosť sa líšia."
  },
  {
    "id": "attr.care.individual_lodging",
    "label": "Individuálne ubytovanie",
    "categories": [
      "hotely-a-opatrovanie"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Oddelené ubytovanie."
  },
  {
    "id": "attr.care.medication_support",
    "label": "Pomoc s podávaním liekov",
    "categories": [
      "hotely-a-opatrovanie"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Podľa pokynov majiteľa."
  },
  {
    "id": "attr.walk.accepts_puppies",
    "label": "Venčenie šteniat",
    "categories": [
      "vencenie"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Cieľová skupina, nie služba."
  },
  {
    "id": "attr.walk.accepts_special_needs",
    "label": "Psy so špecifickými potrebami",
    "categories": [
      "vencenie"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Cieľová skupina, nie služba."
  },
  {
    "id": "attr.walk.gps_report",
    "label": "GPS alebo foto report",
    "categories": [
      "vencenie"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "V0.2 spoločný údaj; neskôr možná revízia."
  },
  {
    "id": "attr.physio.home_visits",
    "label": "Fyzioterapia u klienta",
    "categories": [
      "fyzioterapia"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Nie veterinárny výjazd."
  },
  {
    "id": "attr.physio.postoperative_focus",
    "label": "Pooperačné zameranie",
    "categories": [
      "fyzioterapia"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Indikácia, nie metóda."
  },
  {
    "id": "attr.physio.neurological_focus",
    "label": "Neurologické zameranie",
    "categories": [
      "fyzioterapia"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Indikácia, nie metóda."
  },
  {
    "id": "attr.physio.orthopedic_focus",
    "label": "Ortopedické zameranie",
    "categories": [
      "fyzioterapia"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Indikácia, nie metóda."
  },
  {
    "id": "attr.transport.international",
    "label": "Medzinárodná preprava",
    "categories": [
      "dalsie-sluzby"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Zahraničné trasy."
  },
  {
    "id": "attr.transport.registered_carrier",
    "label": "Registrovaný prepravca",
    "categories": [
      "dalsie-sluzby"
    ],
    "valueKind": "tri_state",
    "allowedValues": [],
    "meaning": "Registrácia, nie prepravná služba."
  }
];
export const providerTypeCatalog:readonly PropertyDefinition[]=[
  {
    "id": "provider.vet.facility_type",
    "label": "Typ veterinárneho pracoviska",
    "categories": [
      "veterinari"
    ],
    "valueKind": "single_select",
    "allowedValues": [
      "ambulance",
      "clinic",
      "hospital",
      "unknown"
    ],
    "meaning": "Typ zariadenia, nie služba."
  },
  {
    "id": "provider.care.provider_kind",
    "label": "Typ poskytovateľa opatery",
    "categories": [
      "hotely-a-opatrovanie"
    ],
    "valueKind": "single_select",
    "allowedValues": [
      "facility",
      "individual",
      "other",
      "unknown"
    ],
    "meaning": "Zariadenie alebo individuálny opatrovateľ."
  }
];
export const legacyFacetMappings:readonly LegacyFacetMapping[]=[
  {
    "legacyId": "veterinari.facility_type",
    "targetId": "provider.vet.facility_type",
    "targetKind": "provider",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "veterinari.emergency",
    "targetId": "attr.vet.emergency",
    "targetKind": "attribute",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "veterinari.home_visits",
    "targetId": "attr.vet.home_visits",
    "targetKind": "attribute",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "treneri.individual_training",
    "targetId": "attr.training.individual_mode",
    "targetKind": "attribute",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "treneri.group_training",
    "targetId": "attr.training.group_mode",
    "targetKind": "attribute",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "kynologicke-kluby.trial_preparation",
    "targetId": "svc.training.exam_preparation",
    "targetKind": "service",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "kynologicke-kluby.group_training",
    "targetId": "attr.training.group_mode",
    "targetKind": "attribute",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "chovatelske-kluby.breeding_advice",
    "targetId": "svc.breeding.advice",
    "targetKind": "service",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "chovatelske-kluby.member_events",
    "targetId": "attr.breedclub.member_events",
    "targetKind": "attribute",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "chovatelske-stanice.visits_by_appointment",
    "targetId": "attr.kennel.visits_by_appointment",
    "targetKind": "attribute",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "chovatelske-stanice.health_testing_information",
    "targetId": "attr.kennel.health_testing_information",
    "targetKind": "attribute",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "salony-a-sluzby.nail_trimming",
    "targetId": "svc.groom.nails",
    "targetKind": "service",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "salony-a-sluzby.hand_stripping",
    "targetId": "svc.groom.stripping",
    "targetKind": "service",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "hotely-a-opatrovanie.overnight_stays",
    "targetId": "svc.care.boarding",
    "targetKind": "service",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "hotely-a-opatrovanie.daycare",
    "targetId": "svc.care.daycare",
    "targetKind": "service",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "vencenie.individual_walks",
    "targetId": "svc.walk.individual",
    "targetKind": "service",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "vencenie.group_walks",
    "targetId": "svc.walk.group",
    "targetKind": "service",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "fyzioterapia.hydrotherapy",
    "targetId": "svc.physio.hydrotherapy",
    "targetKind": "service",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "fyzioterapia.home_visits",
    "targetId": "attr.physio.home_visits",
    "targetKind": "attribute",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "dalsie-sluzby.pet_transport",
    "targetId": "svc.transport.dogs",
    "targetKind": "service",
    "mode": "lossless_explicit_only"
  },
  {
    "legacyId": "dalsie-sluzby.equipment_rental",
    "targetId": "svc.other.equipment_rental",
    "targetKind": "service",
    "mode": "lossless_explicit_only"
  }
];

export function normalizeCatalogLabel(raw:string):string{return raw.normalize("NFC").trim().replace(/\s+/g," ").toLocaleLowerCase("sk");}
function checkIds(items:readonly {id:string}[],prefix:string):void{
 const seen=new Set<string>();
 for(const item of items){if(!item.id.startsWith(prefix+"."))throw Error("Invalid namespace: "+item.id);if(seen.has(item.id))throw Error("Duplicate ID: "+item.id);seen.add(item.id);}
}
export function validateServiceCatalog(items:readonly ServiceDefinition[]=serviceCatalog):void{
 checkIds(items,"svc");const aliases=new Map<string,string>();
 for(const service of items){
  if(!service.categories.length||new Set(service.categories).size!==service.categories.length)throw Error("Duplicate or missing membership: "+service.id);
  if(!service.categories.every(category=>serviceFilterCategories.includes(category)))throw Error("Unknown category: "+service.id);
  if(!service.label.trim()||!service.meaning.trim())throw Error("Missing semantics: "+service.id);
  for(const raw of[service.label,...service.aliases]){
   const term=normalizeCatalogLabel(raw);if(!term)throw Error("Empty alias: "+service.id);
   const old=aliases.get(term);if(old&&old!==service.id)throw Error("Ambiguous alias: "+term);
   aliases.set(term,service.id);
  }
 }
}
export function validateServiceCatalogContract():void{
 validateServiceCatalog();checkIds(attributeCatalog,"attr");checkIds(providerTypeCatalog,"provider");
 const all=[...serviceCatalog,...attributeCatalog,...providerTypeCatalog];if(new Set(all.map(x=>x.id)).size!==all.length)throw Error("Duplicate across namespaces");
 for(const p of[...attributeCatalog,...providerTypeCatalog]){
  if(!p.categories.length||!p.categories.every(category=>serviceFilterCategories.includes(category)))throw Error("Invalid property category: "+p.id);
  if(!p.meaning.trim())throw Error("Missing property meaning: "+p.id);
  if((p.valueKind==="single_select"||p.valueKind==="multi_select")&&!p.allowedValues.length)throw Error("Missing enum values: "+p.id);
  if(p.valueKind==="tri_state"&&p.allowedValues.length)throw Error("Unexpected tri-state enum: "+p.id);
 }
 if(legacyFacetMappings.length!==21)throw Error("Expected 21 existing facet mappings");
 const seen=new Set<string>();
 for(const map of legacyFacetMappings){
  if(seen.has(map.legacyId))throw Error("Duplicate facet mapping: "+map.legacyId);seen.add(map.legacyId);
  const old=getDirectoryFilterDefinition(map.legacyId);
  const bucket=map.targetKind==="service"?serviceCatalog:map.targetKind==="attribute"?attributeCatalog:providerTypeCatalog;
  const target=bucket.find(x=>x.id===map.targetId);
  if(!old||!target||!target.categories.includes(old.category))throw Error("Invalid legacy facet mapping: "+map.legacyId);
  if(old.valueType==="single_select"&&map.targetKind!=="provider")throw Error("Wrong select mapping: "+map.legacyId);
  if(old.valueType==="tri_state"&&map.targetKind==="provider")throw Error("Wrong tri-state mapping: "+map.legacyId);
 }
 if(directoryFilterRegistry.length!==seen.size||directoryFilterRegistry.some(x=>!seen.has(x.id)))throw Error("Legacy registry mismatch");
}
export function getServiceById(id:string):ServiceDefinition{const found=serviceCatalog.find(x=>x.id===id);if(!found)throw Error("Unknown canonical service: "+id);return found;}
export function getAttributeById(id:string):PropertyDefinition{const found=attributeCatalog.find(x=>x.id===id);if(!found)throw Error("Unknown canonical attribute: "+id);return found;}
export function getProviderTypeById(id:string):PropertyDefinition{const found=providerTypeCatalog.find(x=>x.id===id);if(!found)throw Error("Unknown provider type: "+id);return found;}
export function servicesForCategory(category:string):readonly ServiceDefinition[]{
 if(!serviceFilterCategories.some(c=>c===category))throw Error("Unknown directory category: "+category);
 return serviceCatalog.filter(x=>x.categories.some(c=>c===category));
}
/** Strict approved exact aliases, category-constrained; never fuzzy-infer historical prose. */
export function resolveApprovedServiceName(raw:string,category:string):ServiceDefinition|null{
 if(!raw||!serviceFilterCategories.some(c=>c===category))return null;
 const norm=normalizeCatalogLabel(raw);
 return serviceCatalog.find(x=>x.categories.some(c=>c===category)&&[x.label,...x.aliases].some(a=>normalizeCatalogLabel(a)===norm))??null;
}
/** Pure read-only translation of 21 old facets; missing/false is never explicit NO. */
export function translateLegacyFacetValue(legacyId:string,raw:unknown):{
 legacyId:string;targetId:string;targetKind:LegacyFacetMapping["targetKind"];
 status:"known"|"missing"|"invalid";value:string
}{
 const map=legacyFacetMappings.find(x=>x.legacyId===legacyId);
 const old=getDirectoryFilterDefinition(legacyId);
 if(!map||!old)throw Error("Unknown legacy facet: "+legacyId);
 const result=normalizeDirectoryFilterValue(old,raw);
 const value=map.targetKind==="service"?(result.value==="yes"?"offered":result.value==="no"?"not_offered":"unknown"):result.value;
 return {legacyId,targetId:map.targetId,targetKind:map.targetKind,status:result.status,value};
}
