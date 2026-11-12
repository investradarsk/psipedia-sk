import type { Metadata } from "next";
import BreedFciStandardPage, { generateMetadata as standardMetadata } from "../../fci-standard/page";

type Props = { params: Promise<{ slug: string; breed: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: category, breed } = await params;
  return standardMetadata({ params: Promise.resolve({ slug: breed, category }) });
}

export default async function BreedCategoryStandardPage({ params }: Props) {
  const { slug: category, breed } = await params;
  return BreedFciStandardPage({ params: Promise.resolve({ slug: breed, category }) });
}
