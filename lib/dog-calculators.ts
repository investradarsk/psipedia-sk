/** Calculators use user-supplied inputs; no medical or product defaults are inferred. */
export const DOG_ENERGY_FACTORS = {
  adultNeutered: {label:"Zdravý dospelý – kastrovaný", factor:1.6},
  adultIntact: {label:"Zdravý dospelý – nekastrovaný", factor:1.8},
  adultLow: {label:"Zdravý dospelý so sklonom k priberaniu", factor:1.4},
  puppyYoung: {label:"Zdravé šteňa do 4 mesiacov", factor:3},
  puppyOlder: {label:"Zdravé rastúce šteňa od 4 mesiacov", factor:2},
} as const;
export type DogEnergyStage = keyof typeof DOG_ENERGY_FACTORS;
export const DOG_ENERGY_SOURCE = "https://www.msdvetmanual.com/multimedia/table/daily-maintenance-energy-requirements-for-dogs-and-cats";
export const DOG_RER_SOURCE = "https://www.merckvetmanual.com/management-and-nutrition/nutrition-small-animals/nutritional-requirements-of-small-animals";
export function decimalInput(value:string,min:number,max:number):number|null {
  const s=value.trim().replace(",",".");
  if(!/^\d+(?:\.\d+)?$/.test(s))return null;
  const n=Number(s);return Number.isFinite(n)&&n>=min&&n<=max?n:null;
}
export function dogEnergy(kg:number,stage:DogEnergyStage) {
  if(!Number.isFinite(kg)||kg<0.5||kg>150||!Object.hasOwn(DOG_ENERGY_FACTORS,stage))return null;
  const rer=70*kg**0.75;
  return {rer, daily:rer*DOG_ENERGY_FACTORS[stage].factor};
}
export function foodPortion(kcal:number,energyPerKg:number,otherKcal=0) {
  if(![kcal,energyPerKg,otherKcal].every(Number.isFinite)||kcal<=0||energyPerKg<=0||otherKcal<0||otherKcal>=kcal)return null;
  return (kcal-otherKcal)*1000/energyPerKg;
}
export function foodCosts(kg:number,price:number,grams:number){
  if(![kg,price,grams].every(Number.isFinite)||kg<=0||price<0||grams<=0)return null;
  const days=kg*1000/grams, daily=price/days;
  return {days,daily,monthly:daily*30,yearly:daily*365,perKg:price/kg};
}
export function annualDogBudget(monthly:number,yearly:number,oneTime:number){
  if(![monthly,yearly,oneTime].every(n=>Number.isFinite(n)&&n>=0))return null;
  return {annual:monthly*12+yearly,firstYear:monthly*12+yearly+oneTime};
}
