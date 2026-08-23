import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortalTopic } from "@/components/portal-topic";
import { getPublishedArticles } from "@/lib/article-store";
import { getPortalSubpage } from "@/lib/portal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ako vybrať plemeno",
  description: "Otázky, ktoré si položiť pred výberom plemena psa.",
  alternates: { canonical: "/plemena/vyber-plemena" },
};

export default async function BreedChoicePage() {
  const topic = getPortalSubpage("plemena", "vyber-plemena");
  if (!topic) notFound();
  return <PortalTopic {...topic} articles={await getPublishedArticles()} />;
}
