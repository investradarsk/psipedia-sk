import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminAdoptionEditor } from "@/components/admin-adoption-editor";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getManagedAdoptionById } from "@/lib/adoption-store";
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;const user=await requireAdminPageUser(`/admin/adopcia/${id}`);const item=await getManagedAdoptionById(Number(id));if(!item)notFound();return <AdminShell user={user} eyebrow="Adopcie" title={`Upraviť: ${item.name}`} description="Status, aktuálnosť a kontaktné údaje majú priamy vplyv na verejný profil."><AdminAdoptionEditor item={item}/></AdminShell>}
