"use client";
import { useState, type ReactNode } from "react";
import { PublicTextInput, PublicSelect } from "@/components/public-visual-system/public-form-controls";
import { DOG_ENERGY_FACTORS, DOG_ENERGY_SOURCE, DOG_RER_SOURCE, decimalInput, dogEnergy, foodPortion, foodCosts, annualDogBudget, type DogEnergyStage } from "@/lib/dog-calculators";
import { DogAgeCalculator } from "@/components/dog-age-calculator";
import styles from "./dog-calculators.module.css";

const num=(n:number,digits=0)=>n.toLocaleString("sk-SK",{maximumFractionDigits:digits,minimumFractionDigits:digits});
const eur=(n:number)=>n.toLocaleString("sk-SK",{style:"currency",currency:"EUR"});
function Field({label,value,onChange,hint}:{label:string;value:string;onChange:(value:string)=>void;hint?:string}){
  return <label className={styles.field}>{label}<PublicTextInput type="text" inputMode="decimal" maxLength={16} value={value} onChange={e=>onChange(e.target.value)}/>{hint&&<small>{hint}</small>}</label>;
}
function Result({children}:{children:ReactNode}){return <div className={styles.results} role="status" aria-live="polite">{children}</div>;}
function Metric({label,value}:{label:string;value:string}){return <div><span>{label}</span><strong>{value}</strong></div>;}
function Invalid(){return <p className={styles.note}>Doplň platné nezáporné hodnoty. Hmotnosť, energetická hodnota a dávka musia byť väčšie ako nula.</p>;}
function Energy(){
 const [weight,setWeight]=useState("20"),[stage,setStage]=useState<DogEnergyStage>("adultNeutered");
 const [density,setDensity]=useState(""),[unit,setUnit]=useState("kg"),[other,setOther]=useState("0");
 const kg=decimalInput(weight,.5,150),energy=kg===null?null:dogEnergy(kg,stage);
 const e=decimalInput(density,.1,100000), extras=decimalInput(other,0,10000);
 const grams=energy&&e!==null&&extras!==null?foodPortion(energy.daily,e*(unit==="100g"?10:1),extras):null;
 return <section className={styles.panel} id="energia"><h2>Energia a orientačná denná dávka</h2>
 <p>Pre zdravého psa s primeranou kondíciou. Nejde o predpis dávky ani o plán chudnutia.</p>
 <div className={styles.fields}><Field label="Hmotnosť psa (kg)" value={weight} onChange={setWeight}/><label className={styles.field}>Životná fáza<PublicSelect value={stage} onChange={e=>setStage(e.target.value as DogEnergyStage)}>{Object.entries(DOG_ENERGY_FACTORS).map(([key,item])=><option key={key} value={key}>{item.label}</option>)}</PublicSelect></label></div>
 <Result>{energy?<><Metric label="Pokojová potreba RER" value={num(energy.rer)+" kcal/deň"}/><Metric label="Odhad celkovej energie" value={num(energy.daily)+" kcal/deň"}/></>:<Invalid/>}</Result>
 <h3>Prepočet na gramy krmiva</h3><p className={styles.note}>Zadaj metabolizovateľnú energiu z obalu alebo od výrobcu. Nezamieňaj ju za kJ. Ak ju nepoznáš, výpočet dávky nechaj prázdny.</p>
 <div className={styles.fields}><Field label="Energetická hodnota krmiva" value={density} onChange={setDensity}/><label className={styles.field}>Jednotka energie<PublicSelect value={unit} onChange={e=>setUnit(e.target.value)}><option value="kg">kcal/kg</option><option value="100g">kcal/100 g</option></PublicSelect></label><Field label="Energia z odmien a iného jedla (kcal/deň)" value={other} onChange={setOther}/></div>
 <Result>{grams!==null?<Metric label="Orientačné množstvo krmiva" value={num(grams,1)+" g/deň"}/>:<p className={styles.note}>Na prepočet zadaj platnú energiu krmiva a kalórie mimo hlavnej dávky, ktoré musia byť nižšie ako celkový odhad.</p>}</Result>
 <p className={styles.note}>Vzorec RER = 70 × hmotnosť (kg) na 0,75; celkový odhad = RER × faktor životnej fázy. Sleduj kondíciu a hmotnosť. Rastúce šteňatá, najmä veľkých plemien, potrebujú individuálnu kontrolu výživy; pri chorobe, gravidite, dojčení, obezite alebo intenzívnej práci sa riaď veterinárom.</p>
 <p className={styles.note}>Zdroje: <a href={DOG_RER_SOURCE} target="_blank" rel="noopener noreferrer">Merck Veterinary Manual – potreba energie</a>; <a href={DOG_ENERGY_SOURCE} target="_blank" rel="noopener noreferrer">MSD Veterinary Manual – faktory</a>.</p>
 </section>;
}
function FoodCost(){
 const [kg,setKg]=useState("12"),[price,setPrice]=useState("60"),[dose,setDose]=useState("300");
 const k=decimalInput(kg,.01,1000),p=decimalInput(price,0,100000),d=decimalInput(dose,.1,10000);
 const result=k===null||p===null||d===null?null:foodCosts(k,p,d);
 return <section className={styles.panel} id="spotreba"><h2>Spotreba, výdrž balenia a cena kŕmenia</h2><p>Vychádzaj zo skutočnej dennej dávky. Cena a spotreba sú samostatné od odhadu energie.</p><div className={styles.fields}><Field label="Veľkosť balenia (kg)" value={kg} onChange={setKg}/><Field label="Cena balenia (€)" value={price} onChange={setPrice}/><Field label="Denná dávka (g)" value={dose} onChange={setDose}/></div><Result>{result?<><Metric label="Balenie vydrží približne" value={num(result.days,1)+" dní"}/><Metric label="Cena za kg" value={eur(result.perKg)}/><Metric label="Cena za deň" value={eur(result.daily)}/><Metric label="Za 30 dní" value={eur(result.monthly)}/><Metric label="Za 365 dní" value={eur(result.yearly)}/></>:<Invalid/>}</Result></section>;
}
function Comparison(){
 const [a,setA]=useState(["12","60","300"]),[b,setB]=useState(["10","55","250"]);
 const calc=(v:string[])=>{const k=decimalInput(v[0],.01,1000),p=decimalInput(v[1],0,100000),d=decimalInput(v[2],.1,10000);return k===null||p===null||d===null?null:foodCosts(k,p,d);};
 const x=calc(a),y=calc(b);
 return <section className={styles.panel} id="porovnanie"><h2>Porovnanie dvoch krmív</h2><p>Zohľadňuje skutočnú dávku každého krmiva. Nižšia cena sama osebe neznamená vhodnejšie krmivo.</p><div className={styles.compare}>{([{label:"Krmivo A",values:a,set:setA,result:x},{label:"Krmivo B",values:b,set:setB,result:y}]).map(item=><fieldset key={item.label}><legend>{item.label}</legend>{["Balenie (kg)","Cena (€)","Denná dávka (g)"].map((label,i)=><Field key={label} label={item.label+" – "+label} value={item.values[i]} onChange={v=>item.set(old=>old.map((n,j)=>i===j?v:n))}/>)}<Result>{item.result?<><Metric label="Za kg" value={eur(item.result.perKg)}/><Metric label="Za deň" value={eur(item.result.daily)}/><Metric label="Za 30 dní" value={eur(item.result.monthly)}/></>:<Invalid/>}</Result></fieldset>)}</div><Result>{x&&y?<Metric label={Math.abs(x.daily-y.daily)<.000001?"Obe krmivá stoja rovnako za deň":(x.daily<y.daily?"Krmivo A":"Krmivo B")+" vychádza za 365 dní lacnejšie o"} value={eur(Math.abs(x.yearly-y.yearly))}/>:<Invalid/>}</Result></section>;
}
function Budget(){
 const [food,setFood]=useState("50"),[care,setCare]=useState("20"),[vet,setVet]=useState("150"),[other,setOther]=useState("100"),[equipment,setEquipment]=useState("200");
 const v=[food,care,vet,other,equipment].map(n=>decimalInput(n,0,100000));
 const result=v.some(n=>n===null)?null:annualDogBudget(v[0]!+v[1]!,v[2]!+v[3]!,v[4]!);
 return <section className={styles.panel} id="rozpocet"><h2>Ročný rozpočet na psa</h2><p>Predvyplnené sumy sú iba príkladom, nie odhadom bežných cien.</p><div className={styles.fields}><Field label="Krmivo a odmeny za mesiac (€)" value={food} onChange={setFood}/><Field label="Ostatné mesačné výdavky (€)" value={care} onChange={setCare}/><Field label="Veterinár za rok (€)" value={vet} onChange={setVet}/><Field label="Ostatné ročné výdavky a rezerva (€)" value={other} onChange={setOther}/><Field label="Jednorazová výbava a ďalšie vstupné náklady (€)" value={equipment} onChange={setEquipment}/></div><Result>{result?<><Metric label="Bežný rok" value={eur(result.annual)}/><Metric label="Prvý rok vrátane výbavy" value={eur(result.firstYear)}/></>:<Invalid/>}</Result></section>;
}
export function DogCalculators(){return <div className={styles.tools} data-dog-calculators><Energy/><FoodCost/><Comparison/><Budget/><section className={styles.panel} id="vek"><h2>Vek psa v ľudských rokoch</h2><DogAgeCalculator/></section></div>;}
