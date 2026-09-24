import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
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
import { PartnerPublicOwnership } from "@/components/partner-public-ownership";
import { getPartnerSession } from "@/lib/partner-auth";
import { PARTNER_SESSION_COOKIE } from "@/lib/partner-auth-store";
import { getPublicPartnerProfileManagementState } from "@/lib/partner-public-profile";
import { getPublicProfileReviewData } from "@/lib/profile-review-read";
import { getPublicPartnerCommercialFlags } from "@/lib/partner-commercial-agreements";

export const dynamic = "force-dynamic";

type RuntimeBindings = { DB?: AdoptionD1Database };
type Search = Record<string, string | string[] | undefined>;
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
};

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

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

export default async function OrganizationProfilePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const composition = await getPublicOrganizationCompositionBySlug(slug, requireDatabase());

  if (!composition) notFound();

  const database = requireDatabase();
  const jsonLd = buildOrganizationJsonLd(composition.organization);
  const reviewPage = scalar((await searchParams).reviewsPage);
  const jar = await cookies();
  const partnerToken = jar.get(PARTNER_SESSION_COOKIE)?.value;
  const partnerIdentity = partnerToken ? await getPartnerSession({ token: partnerToken }) : null;
  const partnerStatePromise = getPublicPartnerProfileManagementState({
    accountId: partnerIdentity?.accountId ?? null,
    entityType: "HELP_ORGANIZATION",
    canonicalId: composition.organization.id,
    database,
  });
  const commercialPromise = getPublicPartnerCommercialFlags("HELP_ORGANIZATION", composition.organization.id);
  const reviewsPromise = getPublicProfileReviewData(database, {
    entityType: "HELP_ORGANIZATION",
    canonicalId: composition.organization.id,
  }, { page: reviewPage })
    .then((data) => ({ data, readError: false }))
    .catch((error) => {
      console.error("Public organization reviews read failed", {
        organizationId: composition.organization.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return { data: null, readError: true };
    });
  const [partnerState, reviewResult, commercial] = await Promise.all([partnerStatePromise, reviewsPromise, commercialPromise]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <OrganizationProfileDetail composition={composition} reviews={reviewResult.data} reviewReadError={reviewResult.readError} commercial={commercial} />
      <PartnerPublicOwnership state={partnerState} correctionHref="/opravy-a-podnety" />
    </>
  );
}
