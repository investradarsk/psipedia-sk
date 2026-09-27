import { AdminGooglePlacesCanary } from "@/components/admin-google-places-canary";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { googlePlacesApiKey } from "@/lib/google-places-provider";

export const dynamic = "force-dynamic";

export default async function AdminGooglePlacesPage() {
  const user = await requireAdminPageUser("/admin/nastroje/google-places");
  return (
    <AdminShell
      user={user}
      eyebrow="Nástroje · GEO"
      title="Google Places — Place ID canary"
      description="Bounded, operator-controlled identity matching pre exact DIRECTORY_PROFILE lokality. Google nikdy nemení canonical adresu ani naše GEO súradnice."
    >
      <AdminGooglePlacesCanary configured={Boolean(googlePlacesApiKey())} />
    </AdminShell>
  );
}
