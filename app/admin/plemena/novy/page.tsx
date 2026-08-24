import { AdminBreedEditor } from "@/components/admin-breed-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
export const dynamic="force-dynamic";
export default async function NewBreedPage(){const user=await requireAdminPageUser("/admin/plemena/novy");return <AdminShell user={user} eyebrow="Atlas plemien" title="Pridať plemeno" description="Vyplň profil a publikuj ho, keď je pripravený."><AdminBreedEditor/></AdminShell>}
