import { AdminBreedEditor } from "@/components/admin-breed-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getBreedEditorOptions } from "@/lib/breed-store";
export const dynamic="force-dynamic";
export default async function NewBreedPage(){const user=await requireAdminPageUser("/admin/plemena/novy");const options=await getBreedEditorOptions();return <AdminShell user={user} eyebrow="Atlas plemien" title="Pridať plemeno" description="Vyplň profil a publikuj ho, keď je pripravený."><AdminBreedEditor options={options}/></AdminShell>}
