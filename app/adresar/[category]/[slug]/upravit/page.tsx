import { notFound, permanentRedirect } from "next/navigation";
import { getDirectoryCategory } from "@/lib/directory";
import { getPublishedDirectoryProfile } from "@/lib/directory-store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ category: string; slug: string }> };

/**
 * The anonymous correction form has been retired. Preserve old links by
 * returning visitors to the canonical public profile, whose Partner panel
 * chooses the right sign-in, claim or edit action for their account.
 *
 * The public POST API is retired separately in step 3/10.
 */
export default async function RetiredDirectoryCorrectionPage({ params }: Props) {
  const { category, slug } = await params;
  if (!getDirectoryCategory(category)) notFound();
  const profile = await getPublishedDirectoryProfile(category, slug);
  if (!profile) notFound();
  permanentRedirect(`/adresar/${profile.category}/${profile.slug}`);
}
