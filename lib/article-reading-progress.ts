export type ArticleReadingGeometry = {
  scrollY: number;
  viewportHeight: number;
  startTop: number;
  endBottom: number;
};

export function clampArticleReadingProgress(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function articleReadingProgress({ scrollY, viewportHeight, startTop, endBottom }: ArticleReadingGeometry) {
  const start = startTop;
  const end = Math.max(start + 1, endBottom - Math.max(0, viewportHeight));
  return clampArticleReadingProgress((scrollY - start) / (end - start));
}
