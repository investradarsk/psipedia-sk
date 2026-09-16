import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrganizationProfileDetail } from "@/components/organization-profile-detail";
import type { AdoptionD1Database } from "@/lib/adoption-store";
import {
  getPublicOrganizationBySlug,
  getPublicOrganizationCompositionBySlug,
} from "@/lib/help-organization-store";
import { buildOrganizationJsonLd, buildOrganizationMetadata } from "@/lib/organization-seo";
import { serializeJsonLd } from "@/lib/seo";

export const dynamic = "force-dynamic";

type RuntimeBindings = { DB?: AdoptionD1Database };
type Props = { params: Promise<{ slug: string }> };

function requireDatabase() {
  const database = (env as unknown as RuntimeBindings).DB;
  if (!database || typeof database.prepare !== "function") {
    throw new Error("Databáza organizácií zatiaľ nie je pripojená.");
  }
  return database;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const organization = await getPublicOrganizationBySlug(slug, requireDatabase());
  if (!organization) return {};

  return buildOrganizationMetadata(organization);
}

export default async function OrganizationProfilePage({ params }: Props) {
  const { slug } = await params;
  const composition = await getPublicOrganizationCompositionBySlug(slug, requireDatabase());

  if (!composition) notFound();

  const jsonLd = buildOrganizationJsonLd(composition.organization);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <OrganizationProfileDetail composition={composition} />
    </>
  );
}
