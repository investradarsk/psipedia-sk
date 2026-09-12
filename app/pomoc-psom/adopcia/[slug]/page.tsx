import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdoptionDetail } from "@/components/adoption-detail";
import { getPublicAdoptionBySlug } from "@/lib/adoption-store";
import { buildPageMetadata } from "@/lib/seo";
export const dynamic="force-dynamic";
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const {slug}=await params;const dog=await getPublicAdoptionBySlug(slug);if(!dog)return {title:"Adopcia sa nenašla",robots:{index:false,follow:false}};const index=dog.status==='ACTIVE';return {...buildPageMetadata({title:`${dog.name} – pes na adopciu`,description:dog.shortDescription,path:`/pomoc-psom/adopcia/${dog.slug}`,image:dog.mainImage??undefined}),robots:{index,follow:true}};}
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const dog=await getPublicAdoptionBySlug(slug);if(!dog)notFound();return <AdoptionDetail dog={dog}/>;}
