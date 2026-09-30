import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminEshopEditor } from "@/components/admin-eshop-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getManagedEshopById } from "@/lib/eshop-ratings";

export const dynamic = "force-dynamic";

export default async function AdminEshopEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  const user = await requireAdminPageUser(`/admin/recenzie/eshopy/${rawId}`);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const shop = await getManagedEshopById(id);
  if (!shop) notFound();

  return (
    <AdminShell
      user={user}
      eyebrow="Recenzie a testy · E-shopy"
      title={shop.name}
      description="Uprav verejný profil, zameranie sortimentu a logo e-shopu."
      actions={<Link href="/admin/recenzie/eshopy">← Späť na e-shopy</Link>}
    >
      <AdminEshopEditor shop={shop} />
    </AdminShell>
  );
}
