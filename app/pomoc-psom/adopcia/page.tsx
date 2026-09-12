import type { Metadata } from "next";
import { AdoptionBrowser } from "@/components/adoption-browser";
import { listPublicAdoptions, type AdoptionQuery } from "@/lib/adoption-store";
import { buildPageMetadata } from "@/lib/seo";
export const dynamic="force-dynamic";
export const metadata:Metadata=buildPageMetadata({title:"Psy na adopciu",description:"Overované profily psov na adopciu na Slovensku. Filtrujte podľa kraja, veku, veľkosti a vhodnosti do domácnosti.",path:"/pomoc-psom/adopcia"});
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const raw=await searchParams;const one=(k:string)=>typeof raw[k]==='string'?raw[k] as string:undefined;const query:AdoptionQuery={q:one('q'),region:one('region'),sex:one('sex'),age:one('age'),size:one('size'),children:one('children'),dogs:one('dogs'),cats:one('cats'),status:one('status'),sort:one('sort'),page:Math.max(1,Number(one('page'))||1)};return <AdoptionBrowser result={await listPublicAdoptions(query)} query={query}/>;}
