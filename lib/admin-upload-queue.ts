/**
 * Keep image conversions and uploads responsive by using at most two workers.
 * Upload callbacks handle per-file failures so other files continue.
 */
export async function runAdminUploadQueue<T>(
  items: readonly T[],
  upload: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Math.min(2, items.length);
  await Promise.all(Array.from({ length: workers }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await upload(item);
    }
  }));
}
