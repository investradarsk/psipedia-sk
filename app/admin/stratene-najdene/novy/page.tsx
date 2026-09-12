import { AdminLostFoundEditor } from "@/components/admin-lost-found-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listPublishedBreedOptions } from "@/lib/lost-found-dog-store";
export const dynamic="force-dynamic";
export default async function NewLostFoundReportPage(){const user=await requireAdminPageUser("/admin/stratene-najdene/novy");const breeds=await listPublishedBreedOptions();return <AdminShell user={user} eyebrow="Nové hlásenie" title="Stratený alebo nájdený pes" description="Najprv vytvor a skontroluj záznam. Verejný anonymný formulár v tejto fáze nie je zapojený."><AdminLostFoundEditor breeds={breeds}/></AdminShell>}
