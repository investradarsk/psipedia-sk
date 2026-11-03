/** Data boundary only: actual public components render synthetic isolated records. */
export async function getSectionHeroVisual(visualKey: string) {
  return {
    visualKey,
    source: "fixture",
    imageUrl: "/images/events/defaults/preteky.webp",
    altText: "Ilustrácia",
    desktopCrop: { x: 50, y: 50, zoom: 1 },
    mobileCrop: { x: 50, y: 50, zoom: 1 },
    heroContent: { config: { quickLinks: [] } },
  };
}
export async function getArticleDiscoveryData() {
  return { popularity: { "24h": [], "7d": [] } };
}
export async function getDirectoryCategoryPreviews() {
  return {};
}
