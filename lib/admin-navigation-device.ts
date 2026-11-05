/**
 * iOS and iPadOS WebKit can keep an obsolete RSC router tree after a deployment.
 * Other mobile browsers should use normal client-side admin navigation.
 */
export function isIosWebKitDevice(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
): boolean {
  return /\b(iPhone|iPad|iPod)\b/i.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1);
}
