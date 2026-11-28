import { redirect } from "next/navigation";
import { requireAdminPageUser } from "@/lib/admin-auth";
export const dynamic="force-dynamic";
export default async function AdminHelpSourceChecksPage(){
 await requireAdminPageUser("/admin/operations/overovanie-zdrojov");
 redirect("/admin/kvalita?aktualnost=1&agenda=adoptions#zdroje");
}
