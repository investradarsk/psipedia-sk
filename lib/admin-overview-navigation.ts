import { ADMIN_NAVIGATION_INTENT_EVENT, type AdminNavigationIntent } from "./admin-editor-navigation.ts";

/**
 * A desktop navigation group is a button, not a link. Send its navigation
 * through the same cancelable intent gate as Admin's command palette.
 *
 * A dirty editor can prevent the immediate transition and replay the supplied
 * callback only after explicit discard. If no guard cancels the event, invoke
 * the router callback exactly once.
 */
export function dispatchAdminOverviewNavigation(
  navigate: () => void,
  dispatch: (event: Event) => boolean = (event) => window.dispatchEvent(event),
): void {
  const intent = new CustomEvent<AdminNavigationIntent>(ADMIN_NAVIGATION_INTENT_EVENT, {
    cancelable: true,
    detail: { href: "/admin", navigate },
  });
  if (dispatch(intent)) navigate();
}
