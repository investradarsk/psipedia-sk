import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { DirectoryProfileDetail } from "@/components/directory-profile-detail";
import { directoryProfileHref, getDirectoryCategory } from "@/lib/directory";
import { getPublishedDirectoryProfile } from "@/lib/directory-store";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string; slug: string }> };

const LEGACY_DIRECTORY_SLUGS: Record<string, string> = {
  "veterinari/veterinarna-poliklinika-althea": "veterinarna-poliklinka-althea",
};

function resolveDirectorySlug(category: string, slug: string) {
  return LEGACY_DIRECTORY_SLUGS[`${category}/${slug}`] ?? slug;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, slug } = await params;
  const profile = await getPublishedDirectoryProfile(category, resolveDirectorySlug(category, slug));
  return profile ? buildPageMetadata({
    title: profile.name,
    description: profile.excerpt,
    path: directoryProfileHref(profile),
    image: profile.imageUrl || null,
    imageAlt: profile.name,
  }) : {};
}

export default async function DirectoryProfilePage({ params }: Props) {
  const { category, slug } = await params;
  if (!getDirectoryCategory(category)) notFound();
  const resolvedSlug = resolveDirectorySlug(category, slug);
  if (resolvedSlug !== slug) permanentRedirect(`/adresar/${category}/${resolvedSlug}`);
  const profile = await getPublishedDirectoryProfile(category, resolvedSlug);
  if (!profile) notFound();
  return <DirectoryProfileDetail profile={profile} />;
}
