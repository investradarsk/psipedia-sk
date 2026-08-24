import { notFound } from "next/navigation";
import { AdminBreedEditor } from "@/components/admin-breed-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getManagedBreed } from "@/lib/breed-store";
export const dynamic="force-dynamic";
export default async function EditBreedPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const numeric=Number(id);if(!Number.isSafeInteger(numeric))notFound();const user=await requireAdminPageUser(`/admin/plemena/${id}`);const breed=await getManagedBreed(numeric);if(!breed)notFound();return <AdminShell user={user} eyebrow={breed.status==="published"?"Publikované plemeno":"Koncept"} title={`Upraviť: ${breed.name}`} description="Zmeny sa na verejnom atlase ukážu po publikovaní."><AdminBreedEditor breed={breed}/></AdminShell>}
