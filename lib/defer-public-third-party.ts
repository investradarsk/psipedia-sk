/** Schedule optional third-party work outside the initial interaction frame.
 * Never use this for required page content, consent decisions or page views.
 * The injected scheduler makes deadline/cancellation semantics unit-testable.
 */
export type PublicIdleScheduler = {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout: (handler: () => void, timeout: number) => number;
  clearTimeout: (handle: number) => void;
};

export const THIRD_PARTY_IDLE_TIMEOUT_MS = 900;

export function deferPublicThirdParty(
  task: () => void,
  scheduler: PublicIdleScheduler,
): () => void {
  let active = true;
  const invoke = () => {
    if (!active) return;
    active = false;
    task();
  };
  if (typeof scheduler.requestIdleCallback === "function") {
    const handle = scheduler.requestIdleCallback(invoke, {
      timeout: THIRD_PARTY_IDLE_TIMEOUT_MS,
    });
    return () => {
      active = false;
      scheduler.cancelIdleCallback?.(handle);
    };
  }

  // Safari and older embedded browsers do not provide requestIdleCallback.
  const handle = scheduler.setTimeout(invoke, THIRD_PARTY_IDLE_TIMEOUT_MS);
  return () => {
    active = false;
    scheduler.clearTimeout(handle);
  };
}
