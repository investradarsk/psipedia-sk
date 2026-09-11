import { eligibleNavigationClick, navigationProgress, routeKey } from "./lib/navigation-progress";

// Supported Next/Vinext lifecycle hook. This runs only when the router actually
// accepts navigation; preventDefault/onNavigate cancellations do not start UI.
let committedHref = window.location.href;
let clickAllowed: boolean | undefined;

document.addEventListener("click", (event) => {
  const link = event.composedPath().find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement);
  clickAllowed = link ? eligibleNavigationClick(event, {
    href: link.href,
    target: link.getAttribute("target") ?? document.querySelector("base")?.target ?? "",
    download: link.hasAttribute("download"),
  }, window.location.href) : undefined;
  // Start at the browser event boundary so accepted Link clicks paint before
  // an RSC request can block. The router hook below remains the source for
  // programmatic transitions and history traversal. This listener observes
  // only; it never prevents the click or replaces Link/router behavior.
  if (clickAllowed) navigationProgress.begin();
  queueMicrotask(() => { clickAllowed = undefined; });
}, true);

window.addEventListener("psipedia:route-committed", () => {
  committedHref = window.location.href;
  navigationProgress.complete();
});
window.addEventListener("pagehide", () => navigationProgress.reset());
window.addEventListener("pageshow", () => {
  committedHref = window.location.href;
  navigationProgress.reset();
});
window.addEventListener("error", () => navigationProgress.reset());
window.addEventListener("unhandledrejection", () => navigationProgress.reset());

export function onRouterTransitionStart(href: string, navigationType: "push" | "replace" | "traverse") {
  const target = routeKey(href, window.location.href);
  if (target === null || (navigationType !== "traverse" && clickAllowed === false)) return;
  if (target === routeKey(committedHref, window.location.href)) {
    // Back to the already-rendered route also cancels any older in-flight UI.
    if (navigationType === "traverse") navigationProgress.reset();
    return;
  }
  navigationProgress.begin();
}
