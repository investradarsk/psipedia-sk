import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const root = read("app/admin/admin-workspace.css");
const legacy = read("app/admin/admin-legacy-scoped.css");
const actionCss = read("components/admin-interaction-system.module.css");
const workspaceCss = read("components/admin-editor-workspace.module.css");
const action = read("components/admin-interaction-system.tsx");
const editor = read("components/admin-editor-workspace.tsx");

test("Admin V3 semantic palette is declared once on the admin workspace, without changing shell identity", () => {
  for (const token of [
    "--admin-v3-green", "--admin-v3-green-hover", "--admin-v3-focus",
    "--admin-v3-secondary-border", "--admin-v3-secondary-text",
    "--admin-v3-neutral-border", "--admin-v3-neutral-text",
    "--admin-v3-destructive-text", "--admin-v3-destructive-background",
    "--admin-v3-control-border", "--admin-v3-control-background",
    "--admin-v3-status-success-text", "--admin-v3-card-radius",
  ]) assert.equal((root.match(new RegExp(token + ":", "g")) ?? []).length, 1, token);
  assert.match(root, /--admin-v3-green: #0c3d2b/);
  assert.match(root, /--admin-v3-canvas: #f6f8f7/);
  assert.match(root, /--admin-focus: var\(--admin-v3-focus\)/);
  assert.match(root, /\[data-admin-workspace\] :is\(\.admin-panel,\.admin-form-card\)/);
  assert.doesNotMatch(root, /--admin-focus: #996b20/);
});

test("legacy and module action variants consume one visual contract", () => {
  for (const css of [legacy, actionCss]) {
    for (const token of [
      "--admin-v3-green", "--admin-v3-green-hover",
      "--admin-v3-destructive-text", "--admin-v3-destructive-background",
      "--admin-v3-focus",
    ]) assert.ok(css.includes("var(" + token), token);
  }
  for (const css of [actionCss, workspaceCss]) {
    assert.match(css, /var\(--admin-v3-focus,/);
    assert.match(css, /var\(--admin-v3-control-border,/);
    assert.match(css, /:focus-visible/);
  }
  assert.match(actionCss, /\.action:disabled/);
  assert.match(actionCss, /\.action\[data-loading="true"\]::after/);
  assert.match(actionCss, /prefers-reduced-motion: reduce/);
  assert.match(action, /loading\?: boolean/);
  assert.match(action, /disabled=\{disabled \|\| loading\}/);
  assert.match(action, /aria-busy=\{loading \? true/);
});

test("workspace uses V3 status, input, card and navigation values", () => {
  for (const token of [
    "--admin-v3-status-neutral-background", "--admin-v3-status-success-background",
    "--admin-v3-status-warning-background", "--admin-v3-status-danger-background",
    "--admin-v3-control-invalid", "--admin-v3-control-border",
    "--admin-v3-green", "--admin-v3-line",
  ]) assert.ok(workspaceCss.includes("var(" + token), token);
  assert.match(workspaceCss, /\.navigation button:hover:not\(:disabled\)/);
  assert.match(workspaceCss, /@media \(max-width: 820px\)/);
  assert.match(workspaceCss, /height: 100dvh/);
});

test("dirty-state safety stays explicit and native dialogs restore keyboard focus", () => {
  assert.match(editor, /window\.addEventListener\("beforeunload", warn\)/);
  assert.match(editor, /if \(dirty\) setConfirmClose\(true\)/);
  assert.doesNotMatch(editor, /window\.addEventListener\("(click|popstate)"/);
  assert.match(action, /onClose=\{restoreFocus\}/);
  assert.match(action, /onKeyDown=\{keepAdminDialogFocus\}/);
});

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16) / 255);
  return channels.map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(foreground, background) {
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
test("primary, destructive and input labels meet WCAG AA text contrast", () => {
  for (const [foreground, background] of [
    ["0c3d2b", "ffffff"], ["075235", "ffffff"],
    ["a5232b", "fff2f2"], ["314f44", "fbfcf9"],
    ["146035", "dcefe1"], ["77500c", "fff1d2"],
    ["922f21", "fce7e2"],
  ]) assert.ok(contrast(foreground, background) >= 4.5, foreground + " contrast");
});
