import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { OrganizationProfileDetail } from "@/components/organization-profile-detail";
import type { AdoptionD1Database } from "@/lib/adoption-store";
import { getPublicOrganizationCompositionBySlug } from "@/lib/help-organization-store";

export const dynamic = "force-dynamic";

type RuntimeBindings = { DB?: AdoptionD1Database };

function requireDatabase() {
  const database = (env as unknown as RuntimeBindings).DB;
  if (!database || typeof database.prepare !== "function") {
    throw new Error("Databáza organizácií zatiaľ nie je pripojená.");
  }
  return database;
}

export default async function OrganizationProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const composition = await getPublicOrganizationCompositionBySlug(slug, requireDatabase());

  if (!composition) notFound();

  return <OrganizationProfileDetail composition={composition} />;
}
