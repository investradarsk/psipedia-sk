import type { Metadata } from "next";
import { LostFoundDogDetail, lostFoundDogMetadata } from "@/components/lost-found-dog-detail";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { slug } = await params; return lostFoundDogMetadata("FOUND", slug); }
export default async function FoundDogDetailPage({ params }: Props) { const { slug } = await params; return <LostFoundDogDetail type="FOUND" slug={slug} />; }
