import { eventTypes, slovakRegions } from "@/lib/events";

export type PartnerEventValue=string|boolean|null;
export type PartnerEventPatch=Record<string,PartnerEventValue>;

export const partnerEventFields=[
  {key:"title",label:"Názov",kind:"text",required:true},
  {key:"excerpt",label:"Krátky popis",kind:"textarea",required:true},
  {key:"eventType",label:"Typ podujatia",kind:"select",required:true,options:eventTypes},
  {key:"startDate",label:"Dátum začiatku",kind:"date",required:true},
  {key:"startTime",label:"Čas začiatku",kind:"time"},
  {key:"endDate",label:"Dátum konca",kind:"date"},
  {key:"endTime",label:"Čas konca",kind:"time"},
  {key:"venue",label:"Miesto",kind:"text"},
  {key:"city",label:"Mesto / Online",kind:"text",required:true},
  {key:"region",label:"Kraj",kind:"select",required:true,options:slovakRegions},
  {key:"address",label:"Adresa",kind:"text"},
  {key:"organizer",label:"Organizátor",kind:"text",required:true},
  {key:"description",label:"Popis",kind:"textarea",required:true},
  {key:"practicalInfo",label:"Praktické informácie",kind:"textarea"},
  {key:"websiteUrl",label:"Web",kind:"url"},
  {key:"registrationUrl",label:"Registrácia",kind:"url"},
] as const;
export type PartnerEventField=(typeof partnerEventFields)[number];
