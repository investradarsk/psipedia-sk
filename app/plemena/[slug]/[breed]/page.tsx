import type { Metadata } from "next";
import BreedDetailPage, { generateMetadata as breedMetadata } from "../page";

type Props = { params: Promise<{ slug: string; breed: string }> };

export const dynamic = "force-dynamic";

/** The first segment identifies the FCI category; the last is the breed slug. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: category, breed } = await params;
  return breedMetadata({ params: Promise.resolve({ slug: breed, category }) });
}

export default async function BreedCategoryDetailPage({ params }: Props) {
  const { slug: category, breed } = await params;
  return BreedDetailPage({ params: Promise.resolve({ slug: breed, category }) });
}
