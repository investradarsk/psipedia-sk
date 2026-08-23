import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DirectoryProfileDetail } from "@/components/directory-profile-detail";
import { directoryProfileHref, getDirectoryCategory } from "@/lib/directory";
import { getPublishedDirectoryProfile } from "@/lib/directory-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, slug } = await params;
  const profile = await getPublishedDirectoryProfile(category, slug);
  return profile ? {
    title: profile.name,
    description: profile.excerpt,
    alternates: { canonical: directoryProfileHref(profile) },
    openGraph: profile.imageUrl ? { images: [profile.imageUrl] } : undefined,
  } : {};
}

export default async function DirectoryProfilePage({ params }: Props) {
  const { category, slug } = await params;
  if (!getDirectoryCategory(category)) notFound();
  const profile = await getPublishedDirectoryProfile(category, slug);
  if (!profile) notFound();
  return <DirectoryProfileDetail profile={profile} />;
}
