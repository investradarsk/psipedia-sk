import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildPageMetadata,
  SITE_NAME,
  SITE_URL,
  SOCIAL_FALLBACK_IMAGE,
  SOCIAL_LOCALE,
} from "../lib/seo.ts";

function openGraphImage(metadata) {
  const images = metadata.openGraph?.images;
  assert.ok(Array.isArray(images) && images.length > 0, "Open Graph image must exist");
  const image = images[0];
  assert.equal(typeof image, "object");
  return image;
}

function assertSocialContract(metadata, { canonical, title, description }) {
  assert.equal(metadata.alternates?.canonical, canonical);
  assert.equal(metadata.openGraph?.url, canonical);
  assert.equal(metadata.openGraph?.title, title);
  assert.equal(metadata.openGraph?.description, description);
  assert.equal(metadata.openGraph?.siteName, SITE_NAME);
  assert.equal(metadata.openGraph?.locale, SOCIAL_LOCALE);

  const image = openGraphImage(metadata);
  assert.match(image.url, /^https:\/\//);
  assert.equal(metadata.twitter?.card, "summary_large_image");
  assert.equal(metadata.twitter?.title, metadata.openGraph?.title);
  assert.equal(metadata.twitter?.description, metadata.openGraph?.description);
  assert.deepEqual(metadata.twitter?.images, [image.url]);
}

function buildRepresentativeMetadata({
  title,
  description,
  path,
  canonical,
  image,
  imageAlt,
  socialTitle,
  socialDescription,
  type = "website",
}) {
  return buildPageMetadata({
    title,
    description,
    path,
    canonical,
    image,
    imageAlt,
    socialTitle,
    socialDescription,
    type,
  });
}

test("article social metadata keeps one canonical OG/Twitter contract", () => {
  const metadata = buildRepresentativeMetadata({
    title: "Praktický článok",
    description: "Popis článku pre vyhľadávanie.",
    path: "/clanky/prakticky-clanok",
    image: "/images/trening-pri-nohe.webp",
    imageAlt: "Pes pri tréningu",
    type: "article",
  });

  assertSocialContract(metadata, {
    canonical: `${SITE_URL}/clanky/prakticky-clanok`,
    title: `Praktický článok | ${SITE_NAME}`,
    description: "Popis článku pre vyhľadávanie.",
  });
  assert.equal(metadata.openGraph?.type, "article");
  assert.equal(openGraphImage(metadata).url, `${SITE_URL}/images/trening-pri-nohe.webp`);
});

test("news metadata preserves explicit social overrides and absolute canonical URL", () => {
  const metadata = buildRepresentativeMetadata({
    title: "Redakčný titulok",
    description: "Redakčný popis.",
    path: "/novinky/redakcna-novinka",
    canonical: "https://psipedia.sk/novinky/redakcna-novinka",
    image: "https://cdn.example.com/news.webp",
    imageAlt: "Ilustračná fotografia",
    socialTitle: "Social titulok novinky",
    socialDescription: "Social popis novinky.",
    type: "article",
  });

  assertSocialContract(metadata, {
    canonical: `${SITE_URL}/novinky/redakcna-novinka`,
    title: "Social titulok novinky",
    description: "Social popis novinky.",
  });
  assert.equal(openGraphImage(metadata).url, "https://cdn.example.com/news.webp");
});

test("breed metadata uses the shared absolute fallback image when no image exists", () => {
  const metadata = buildRepresentativeMetadata({
    title: "Testovacie plemeno | Psipedia",
    description: "Profil testovacieho plemena.",
    path: "/plemena/testovacie-plemeno",
    image: null,
    imageAlt: "Testovacie plemeno",
    type: "article",
    socialTitle: "Testovacie plemeno | Psipedia",
  });

  assertSocialContract(metadata, {
    canonical: `${SITE_URL}/plemena/testovacie-plemeno`,
    title: "Testovacie plemeno | Psipedia",
    description: "Profil testovacieho plemena.",
  });
  assert.deepEqual(openGraphImage(metadata), {
    url: `${SITE_URL}${SOCIAL_FALLBACK_IMAGE.path}`,
    width: SOCIAL_FALLBACK_IMAGE.width,
    height: SOCIAL_FALLBACK_IMAGE.height,
    alt: SOCIAL_FALLBACK_IMAGE.alt,
  });
});

test("event metadata uses canonical URL as its Open Graph URL", () => {
  const metadata = buildRepresentativeMetadata({
    title: "Psie podujatie | Psipedia",
    description: "Termín a praktické informácie.",
    path: "/podujatia/psie-podujatie",
    image: null,
    imageAlt: "Psie podujatie",
    socialTitle: "Psie podujatie | Psipedia",
  });

  assertSocialContract(metadata, {
    canonical: `${SITE_URL}/podujatia/psie-podujatie`,
    title: "Psie podujatie | Psipedia",
    description: "Termín a praktické informácie.",
  });
});

test("directory detail metadata makes relative service images absolute", () => {
  const metadata = buildRepresentativeMetadata({
    title: "Psia škola | Psipedia",
    description: "Kontakt a služby psej školy.",
    path: "/adresar/psie-skoly/psia-skola",
    image: "/media/directory/psia-skola.webp",
    imageAlt: "Psia škola",
    socialTitle: "Psia škola | Psipedia",
  });

  assertSocialContract(metadata, {
    canonical: `${SITE_URL}/adresar/psie-skoly/psia-skola`,
    title: "Psia škola | Psipedia",
    description: "Kontakt a služby psej školy.",
  });
  assert.equal(openGraphImage(metadata).url, `${SITE_URL}/media/directory/psia-skola.webp`);
});

test("organization profile metadata has a complete fallback social preview", () => {
  const metadata = buildRepresentativeMetadata({
    title: "Testovacia organizácia",
    description: "Pomoc psom v testovacom meste.",
    path: "/organizacie/testovacia-organizacia",
    image: null,
  });

  assertSocialContract(metadata, {
    canonical: `${SITE_URL}/organizacie/testovacia-organizacia`,
    title: `Testovacia organizácia | ${SITE_NAME}`,
    description: "Pomoc psom v testovacom meste.",
  });
});

test("representative page builders delegate social metadata to the shared helper", () => {
  const articleSeo = fs.readFileSync(new URL("../lib/article-seo.ts", import.meta.url), "utf8");
  const contentSeo = fs.readFileSync(new URL("../lib/content-seo.ts", import.meta.url), "utf8");
  const breedPage = fs.readFileSync(new URL("../app/plemena/[slug]/page.tsx", import.meta.url), "utf8");
  const portalPage = fs.readFileSync(new URL("../app/[section]/[slug]/page.tsx", import.meta.url), "utf8");
  const directoryPage = fs.readFileSync(new URL("../app/adresar/[category]/[slug]/page.tsx", import.meta.url), "utf8");
  const organizationPage = fs.readFileSync(new URL("../app/organizacie/[slug]/page.tsx", import.meta.url), "utf8");
  const adoptionPage = fs.readFileSync(new URL("../app/pomoc-psom/adopcia/[slug]/page.tsx", import.meta.url), "utf8");

  assert.match(articleSeo, /buildPageMetadata\(\{/);
  assert.doesNotMatch(articleSeo, /openGraph:\s*\{/);
  assert.doesNotMatch(articleSeo, /twitter:\s*\{/);
  assert.match(contentSeo, /buildPageMetadata\(\{/);
  assert.doesNotMatch(contentSeo, /openGraph:\s*\{/);
  assert.doesNotMatch(contentSeo, /twitter:\s*\{/);

  assert.match(breedPage, /buildContentMetadata\(\{/);
  assert.match(portalPage, /buildArticleMetadata\(article\)/);
  assert.match(portalPage, /buildContentMetadata\(\{/);
  assert.match(directoryPage, /buildContentMetadata\(\{/);
  assert.match(adoptionPage, /buildPageMetadata\(\{/);
  assert.match(organizationPage, /export async function generateMetadata/);
  assert.match(organizationPage, /getPublicOrganizationBySlug/);
  assert.match(organizationPage, /buildPageMetadata\(\{/);
});
