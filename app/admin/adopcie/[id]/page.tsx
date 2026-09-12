import { notFound } from "next/navigation";
import { AdminAdoptionEditor } from "@/components/admin-adoption-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getManagedAdoptionById, listAdoptionBreedOptions } from "@/lib/adoption-store";
export const dynamic = "force-dynamic";
type Props={params:Promise<{id:string}>};
export default async function EditAdoptionPage({params}:Props){const {id:raw}=await params;const id=Number.parseInt(raw,10);if(!Number.isSafeInteger(id)||id<1)notFound();const user=await requireAdminPageUser(`/admin/adopcie/${id}`);const [item,breeds]=await Promise.all([getManagedAdoptionById(id),listAdoptionBreedOptions()]);if(!item)notFound();return <AdminShell user={user} eyebrow="Psy na adopciu" title={`Upraviť: ${item.name}`} description="Aktualizuj stav, údaje a dátum posledného overenia."><AdminAdoptionEditor item={item} breeds={breeds}/></AdminShell>}
