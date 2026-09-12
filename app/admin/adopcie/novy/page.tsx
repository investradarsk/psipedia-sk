import { AdminAdoptionEditor } from "@/components/admin-adoption-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listAdoptionBreedOptions } from "@/lib/adoption-store";
export const dynamic = "force-dynamic";
export default async function NewAdoptionPage(){const user=await requireAdminPageUser("/admin/adopcie/novy");return <AdminShell user={user} eyebrow="Psy na adopciu" title="Nový profil psa" description="Najprv môžeš uložiť koncept. Aktívny profil vyžaduje základné údaje, fotografiu a dátum overenia."><AdminAdoptionEditor breeds={await listAdoptionBreedOptions()} /></AdminShell>}
