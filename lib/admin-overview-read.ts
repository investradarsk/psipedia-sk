/**
 * Optional dashboard reads must not keep the authenticated RSC navigation open
 * indefinitely. After the budget, report unavailable data rather than falsely
 * presenting zero items. The original promise remains observed, including a
 * late rejection, so it cannot turn into an unhandled rejection.
 */
export const ADMIN_OVERVIEW_READ_TIMEOUT_MS = 5_000;

export async function settleAdminOverviewRead<T>(
  read: Promise<T>,
  unavailable: T,
  timeoutMs = ADMIN_OVERVIEW_READ_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(unavailable), timeoutMs);
      }),
    ]);
  } catch {
    return unavailable;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
