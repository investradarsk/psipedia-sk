import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function LegacyAutomationSourceDetail({ params }: Props) {
  const { id } = await params;
  redirect("/admin/automatizacie/zdroje/" + encodeURIComponent(id));
}
