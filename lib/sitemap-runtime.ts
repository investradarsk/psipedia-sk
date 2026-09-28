export const SITEMAP_MAX_D1_CONCURRENCY = 1;

export class SitemapStageError extends Error {
  readonly stage: string;

  constructor(stage: string, cause: unknown) {
    super(`sitemap-stage-failed:${stage}`, { cause });
    this.name = "SitemapStageError";
    this.stage = stage;
  }
}

export async function runSitemapStage<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof SitemapStageError) throw error;
    throw new SitemapStageError(stage, error);
  }
}

export function runSitemapStageSync<T>(stage: string, operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof SitemapStageError) throw error;
    throw new SitemapStageError(stage, error);
  }
}

export type SitemapLoadStage = {
  key: string;
  stage: string;
  load: () => Promise<unknown>;
};

/**
 * Cloudflare sitemap reads intentionally run one D1-backed dataset at a time.
 *
 * The previous runtime launched every loader in one Promise.all and the
 * adoption loader fanned out its remaining pages as another Promise.all.
 * Keeping this scheduler sequential gives the request a deterministic upper
 * bound of one in-flight D1 operation, while each individual reader remains
 * cursor-batched and uncapped at the corpus level.
 */
export async function loadSitemapStages(stages: readonly SitemapLoadStage[]) {
  const datasets: Record<string, unknown> = {};
  for (const item of stages) {
    datasets[item.key] = await runSitemapStage(item.stage, item.load);
  }
  return datasets;
}
