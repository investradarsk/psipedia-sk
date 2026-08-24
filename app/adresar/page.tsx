import type { Metadata } from "next";
import { DirectoryPage } from "@/components/directory-page";
import { getPublishedDirectoryProfiles } from "@/lib/directory-store";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "Služby pre psov",
  description: "Veterinári, tréneri, psie školy, kluby a ďalšie služby pre psov na Slovensku.",
  path: "/adresar",
});

export default async function DirectoryHomePage() {
  return <DirectoryPage profiles={await getPublishedDirectoryProfiles()} />;
}
