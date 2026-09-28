import type { Metadata } from "next";
import { LostFoundDogDetail, lostFoundDogMetadata } from "@/components/lost-found-dog-detail";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { slug } = await params; return lostFoundDogMetadata("LOST", slug); }
export default async function LostDogDetailPage({ params }: Props) { const { slug } = await params; return <LostFoundDogDetail type="LOST" slug={slug} />; }
