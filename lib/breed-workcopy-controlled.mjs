/**
 * Exact controlled-property contract of the 60+2 breed Notion source.
 * The 12 new physical columns are NOT the seven legacy prose columns.
 * This module is intentionally pure: it never infers missing values.
 */
export const BREED_CONTROLLED_FIELDS = Object.freeze([
  { key:"fciGroupSelect", notion:"FCI skupina (výber)", type:"select", options:["1","2","3","4","5","6","7","8","9","10"] },
  { key:"fciSectionSelect", notion:"FCI sekcia (výber)", type:"select", options:["1","1.1","1.2","1.3","1.4","2","2.1","2.2","3","4","5","6","7","8","9","10","11"] },
  { key:"originCountries", notion:"Krajiny pôvodu (výber)", type:"multi_select", options:["Afganistan","Argentína","Austrália","Belgicko","Bielorusko","Bosna a Hercegovina","Brazília","Bulharsko","Cyprus","Česko","Čierna Hora","Čína","Dánsko","Egypt","Estónsko","Fínsko","Francúzsko","Grécko","Gruzínsko","Holandsko","Chorvátsko","India","Irán","Írsko","Island","Izrael","Japonsko","Južná Kórea","Kanada","Kuba","Maďarsko","Malta","Maroko","Mexiko","Mongolsko","Nemecko","Nepál","Nórsko","Nový Zéland","Pakistan","Peru","Poľsko","Portugalsko","Rakúsko","Rumunsko","Rusko","Slovensko","Slovinsko","Spojené kráľovstvo","Spojené štáty americké","Srbsko","Španielsko","Švajčiarsko","Švédsko","Taiwan","Thajsko","Tibet (Čína)","Turecko","Ukrajina","Uruguaj","Vietnam"] },
  { key:"sizeSelect", notion:"Veľkosť (výber)", type:"select", options:["Veľmi malé","Malé","Stredné","Veľké","Obrie","Rôzne veľkosti"] },
  { key:"coatTypes", notion:"Typ srsti (výber)", type:"multi_select", options:["Bezsrstá","Krátka","Stredne dlhá","Dlhá","Hladká","Drsná","Tvrdá","Hodvábna","Kučeravá","Vlnitá","Šnúrovitá","Dvojitá s podsadou"] },
  { key:"useTypes", notion:"Využitie (výber)", type:"multi_select", options:["Spoločenský","Pastiersky","Ovčiarsky","Strážny","Lovecký","Pracovný","Športový","Služobný","Záchranársky","Ťažný","Terapeutický","Iné"] },
  { key:"heightMinCm", notion:"Výška od (cm)", type:"number", min:8, max:130 },
  { key:"heightMaxCm", notion:"Výška do (cm)", type:"number", min:8, max:130 },
  { key:"weightMinKg", notion:"Hmotnosť od (kg)", type:"number", min:0.5, max:150 },
  { key:"weightMaxKg", notion:"Hmotnosť do (kg)", type:"number", min:0.5, max:150 },
  { key:"lifespanMinYears", notion:"Dĺžka života od (roky)", type:"number", min:3, max:30 },
  { key:"lifespanMaxYears", notion:"Dĺžka života do (roky)", type:"number", min:3, max:30 },
]);

export const breedControlledKeys = Object.freeze(BREED_CONTROLLED_FIELDS.map(field => field.key));
const byKey = new Map(BREED_CONTROLLED_FIELDS.map(field => [field.key,field]));

export function emptyBreedControlledValues() {
  return Object.fromEntries(BREED_CONTROLLED_FIELDS.map(f => [f.key,f.type==="multi_select"?[]:null]));
}

export function validateBreedControlledValue(key,value) {
  const field=byKey.get(key);
  if (!field) throw Error("BREED_CONTROLLED_UNKNOWN_FIELD");
  if (field.type==="number") {
    if (value===null) return null;
    // Numeric facts are editable data. Restrict the JS storage type only,
    // not editorial ranges (1, 2, or an empty cell are valid test values).
    if (typeof value!=="number" || !Number.isFinite(value))
      throw Error("BREED_CONTROLLED_NUMBER_INVALID");
    return value;
  }
  if (field.type==="select") {
    if (value===null) return null;
    if (typeof value!=="string" || !field.options.includes(value))
      throw Error("BREED_CONTROLLED_SELECT_INVALID");
    return value;
  }
  if (!Array.isArray(value) || value.length>field.options.length ||
      !value.every(item=>typeof item==="string" && field.options.includes(item)) ||
      new Set(value).size!==value.length)
    throw Error("BREED_CONTROLLED_MULTI_SELECT_INVALID");
  return field.options.filter(option=>value.includes(option));
}

export function parseBreedControlledValues(raw) {
  let supplied=raw;
  if (typeof raw==="string") {
    try {supplied=JSON.parse(raw)} catch {throw Error("BREED_CONTROLLED_RECEIPT_INVALID")}
  }
  if (!supplied || typeof supplied!=="object" || Array.isArray(supplied))
    throw Error("BREED_CONTROLLED_RECEIPT_INVALID");
  const state=emptyBreedControlledValues();
  for (const key of breedControlledKeys) {
    if (Object.hasOwn(supplied,key))
      state[key]=validateBreedControlledValue(key,supplied[key]);
  }
  return state;
}

export function readBreedControlledNotionCell(field,property) {
  if (!property || property.type!==field.type)
    throw Error("BREED_CONTROLLED_NOTION_PROPERTY_MISSING");
  if (field.type==="number") return validateBreedControlledValue(field.key,property.number??null);
  if (field.type==="select") return validateBreedControlledValue(field.key,property.select?.name??null);
  if (!Array.isArray(property.multi_select)) throw Error("BREED_CONTROLLED_NOTION_MULTI_MISSING");
  return validateBreedControlledValue(field.key,property.multi_select.map(option=>option.name));
}

export function breedControlledNotionPayload(key,value) {
  const field=byKey.get(key);
  if (!field) throw Error("BREED_CONTROLLED_UNKNOWN_FIELD");
  const valid=validateBreedControlledValue(key,value);
  const cell=field.type==="number"?{number:valid}
    :field.type==="select"?{select:valid===null?null:{name:valid}}
    :{multi_select:valid.map(name=>({name}))};
  return {[field.notion]:cell};
}

export function readBreedControlledNotionPage(page,keys=breedControlledKeys) {
  const values={};
  const errors=[];
  for (const key of keys) {
    const field=byKey.get(key);
    if (!field) continue;
    try { values[key]=readBreedControlledNotionCell(field,page?.properties?.[field.notion]); }
    catch(error) { errors.push({key,code:error instanceof Error?error.message:"INVALID"}); }
  }
  return {values,errors};
}

export function touchedBreedControlledKeys(page,changedProperties) {
  if (!Array.isArray(changedProperties)) return [];
  const edited=new Set(changedProperties);
  return BREED_CONTROLLED_FIELDS.filter(field=>{
    const property=page?.properties?.[field.notion];
    return property && (edited.has(field.notion) || (property.id && edited.has(property.id)));
  }).map(field=>field.key);
}

export function sameBreedControlledValue(a,b) {
  return JSON.stringify(a)===JSON.stringify(b);
}
