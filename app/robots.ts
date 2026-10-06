import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

const INTERNAL_CRAWL_PATHS = ["/admin/", "/api/", "/hladat", "/oblubene"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: INTERNAL_CRAWL_PATHS,
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: INTERNAL_CRAWL_PATHS,
      },
      {
        userAgent: "Google-Extended",
        allow: "/",
        disallow: INTERNAL_CRAWL_PATHS,
      },
      {
        userAgent: "OAI-SearchBot",
        allow: "/",
        disallow: INTERNAL_CRAWL_PATHS,
      },
      {
        userAgent: "ChatGPT-User",
        allow: "/",
        disallow: INTERNAL_CRAWL_PATHS,
      },
      {
        userAgent: "GPTBot",
        disallow: "/",
      },
      {
        userAgent: "Claude-SearchBot",
        allow: "/",
        disallow: INTERNAL_CRAWL_PATHS,
      },
      {
        userAgent: "Claude-User",
        allow: "/",
        disallow: INTERNAL_CRAWL_PATHS,
      },
      {
        userAgent: "ClaudeBot",
        disallow: "/",
      },
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/news-sitemap.xml`],
    host: SITE_URL,
  };
}
