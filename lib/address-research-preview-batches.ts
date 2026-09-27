export const ADDRESS_RESEARCH_IMPORT_PREVIEW_BATCH_SIZE = 20;

export function buildAddressResearchPreviewBatches<T>(profiles: T[]) {
  const batches: Array<{ baseIndex: number; profiles: T[] }> = [];
  for (let baseIndex = 0; baseIndex < profiles.length; baseIndex += ADDRESS_RESEARCH_IMPORT_PREVIEW_BATCH_SIZE) {
    batches.push({
      baseIndex,
      profiles: profiles.slice(baseIndex, baseIndex + ADDRESS_RESEARCH_IMPORT_PREVIEW_BATCH_SIZE),
    });
  }
  return batches;
}
