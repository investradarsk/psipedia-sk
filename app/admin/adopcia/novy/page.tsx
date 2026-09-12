import { AdminShell } from "@/components/admin-shell";
import { AdminAdoptionEditor } from "@/components/admin-adoption-editor";
import { requireAdminPageUser } from "@/lib/admin-auth";
export const dynamic='force-dynamic';
export default async function Page(){const user=await requireAdminPageUser('/admin/adopcia/novy');return <AdminShell user={user} eyebrow="Adopcie" title="Nový adopčný profil" description="Najprv uložte koncept. Publikujte až po overení údajov a súhlase organizácie."><AdminAdoptionEditor/></AdminShell>}
