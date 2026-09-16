import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrganizationProfileDetail } from "@/components/organization-profile-detail";
import type { AdoptionD1Database } from "@/lib/adoption-store";
import {
  getPublicOrganizationBySlug,
  getPublicOrganizationCompositionBySlug,
} from "@/lib/help-organization-store";
import { buildPageMetadata } from "@/lib/seo";

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

  return buildPageMetadata({
    title: organization.name,
    description: organization.shortDescription || organization.description,
    path: `/organizacie/${organization.slug}`,
    image: organization.imageUrl,
    imageAlt: organization.name,
  });
}

export default async function OrganizationProfilePage({ params }: Props) {
  const { slug } = await params;
  const composition = await getPublicOrganizationCompositionBySlug(slug, requireDatabase());

  if (!composition) notFound();

  return <OrganizationProfileDetail composition={composition} />;
}
