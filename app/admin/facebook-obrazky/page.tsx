import { Suspense } from "react";
import { AdminActionButton } from "@/components/admin-interaction-system";
import { AdminDataLoading } from "@/components/admin-data-loading";
import { AdminShell } from "@/components/admin-shell";
import { AdminFacebookImages } from "@/components/admin-facebook-images";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listFacebookImagePosts } from "@/lib/facebook-image-store";
import { facebookWallTime } from "@/lib/facebook-image-post";

export const dynamic = "force-dynamic";

function loadFacebookOverview(month: string) {
  return listFacebookImagePosts(month,"all")
    .then((data) => ({ data, error: "" }))
    .catch((error: unknown) => ({
      data: null,
      error: error instanceof Error ? error.message : "Databáza nie je dostupná.",
    }));
}

async function FacebookContent({
  promise,
  month,
}: {
  promise: ReturnType<typeof loadFacebookOverview>;
  month: string;
}) {
  const { data, error } = await promise;
  return data
    ? <AdminFacebookImages initial={data} initialMonth={month} />
    : <section className="admin-form-card"><p role="alert" className="admin-message admin-message--error">{error}</p><AdminActionButton disabled>Vytvoriť príspevok</AdminActionButton></section>;
}

export default async function FacebookImagesPage() {
  const user = await requireAdminPageUser("/admin/facebook-obrazky");
  const month = facebookWallTime(new Date().toISOString()).date.slice(0, 7);
  const dataPromise = loadFacebookOverview(month);

  return (
    <AdminShell
      user={user}
      eyebrow="Admin · Automatizácie"
      title="Facebook obrázky"
      description="Prehľad príspevkov, kalendár a synchronizácia s Notionom a Facebookom."
    >
      <Suspense fallback={<AdminDataLoading label="Facebook obrázky" />}>
        <FacebookContent promise={dataPromise} month={month} />
      </Suspense>
    </AdminShell>
  );
}
