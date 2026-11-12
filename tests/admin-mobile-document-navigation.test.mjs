import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("only iOS mobile navigation reloads the two unstable streamed routes", () => {
  const guard = read("components/admin-mobile-document-navigation.tsx");
  const layout = read("app/admin/layout.tsx");
  const navigation = read("components/admin-navigation.tsx");
  const quickNavigation = read("components/admin-quick-navigation.tsx");
  const quickNavigationDialog = read("components/admin-quick-navigation-dialog.tsx");
  assert.match(guard, /window\.matchMedia\("\(max-width: 820px\)"\)\.matches/);
  assert.match(guard, /target\.origin !== window\.location\.origin/);
  assert.match(guard, /isIosWebKitDevice\(navigator\.userAgent, navigator\.platform, navigator\.maxTouchPoints\)/);
  assert.match(guard, /target\.pathname !== "\/admin" && target\.pathname !== "\/admin\/clanky"/);
  assert.match(guard, /event\.defaultPrevented \|\| event\.button !== 0/);
  assert.match(guard, /event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey/);
  assert.match(guard, /anchor\.hasAttribute\("download"\)/);
  assert.match(guard, /event\.preventDefault\(\)/);
  assert.match(guard, /window\.location\.assign\(target\.href\)/);
  assert.match(guard, /document\.addEventListener\("click", handler, true\)/);
  assert.match(guard, /document\.removeEventListener\("click", handler, true\)/);
  assert.match(layout, /<AdminMobileDocumentNavigation \/>/);
  assert.match(navigation, /href === "\/admin" \|\| href === "\/admin\/clanky"/);
  assert.match(navigation, /router\.prefetch\(href\)/, "unaffected routes prefetch only on deliberate user intent");
  assert.match(navigation, /prefetched\.current\.clear\(\)/, "intent prefetch cache resets when the committed route changes");
  assert.match(navigation, /prefetch=\{false\}/, "admin destinations must not prefetch the whole D1-backed sidebar");
  assert.match(quickNavigation, /dynamic\(/, "Ctrl+K dialog must remain lazy loaded");
  assert.match(quickNavigation, /admin-quick-navigation-dialog/, "Ctrl+K navigation stays in the dynamically loaded dialog");
  assert.match(quickNavigationDialog, /window\.location\.assign\(target\.href\)/, "Ctrl+K destinations respect the iOS document fallback");
  assert.match(quickNavigationDialog, /router\.push\(href\)/, "other platforms keep fast client-side quick navigation");
});

test("admin route failure renders retry and safe full-document escape links instead of white screen", () => {
  const boundary = read("app/admin/error.tsx");
  const recovery = read("components/admin-recovery-actions.tsx");
  assert.match(boundary, /"use client"/);
  assert.match(boundary, /<AdminErrorRecovery error=\{error\} reset=\{reset\}/);
  assert.match(recovery, /Administrácia sa nenačítala/);
  assert.match(recovery, /window\.location\.reload\(\)/);
  assert.match(recovery, /startRecovery\(\(\) => reset\(\)\)/);
  assert.match(recovery, /data-admin-unsaved-editor/);
  assert.match(recovery, /target="_blank" rel="noopener noreferrer" prefetch=\{false\}/);
  assert.doesNotMatch(boundary + recovery, /error\.message/);
});
