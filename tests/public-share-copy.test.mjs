import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync("components/share-button.tsx", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const url = "https://psipedia.sk/clanky/test";

function mount({ nativeShare, clipboard, fallback }) {
  let state;
  let textareaRemoved = false;
  const button = () => {};
  const exports = {};
  new Function("require", "exports", "window", "document", "navigator", compiled)(
    (name) => {
      if (name === "react") {
        return {
          useMemo: (factory) => factory(),
          useState: (initial) => {
            state ??= initial;
            return [
              state,
              (next) => {
                state = next;
              },
            ];
          },
          useRef: () => ({ current: undefined }),
          useEffect: () => {},
          useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
        };
      }
      if (name === "react/jsx-runtime") {
        const jsx = (type, props) => ({ type, props });
        return { jsx, jsxs: jsx };
      }
      if (name === "@/components/public-visual-system") return { PublicActionButton: button };
      return { default: {} };
    },
    exports,
    { location: { href: url }, setTimeout: () => 1, clearTimeout: () => {} },
    {
      createElement: () => ({
        style: {},
        setAttribute: () => {},
        select: () => {},
        remove: () => {
          textareaRemoved = true;
        },
      }),
      body: { appendChild: () => {} },
      execCommand: fallback,
    },
    { clipboard, share: nativeShare },
  );
  return {
    button: () => exports.ShareButton({ title: "Test", url, compact: true }).props.children.props,
    removed: () => textareaRemoved,
  };
}

test("failed clipboard copy does not report success and always removes the fallback field", async () => {
  for (const fallback of [
    () => false,
    () => {
      throw Error("Copy blocked");
    },
  ]) {
    const mounted = mount({ fallback });
    await mounted.button().onClick();
    assert.match(mounted.button().children, /Kopírovanie zlyhalo/);
    assert.equal(mounted.removed(), true);
  }
});

test("successful fallback copy confirms the operation", async () => {
  const mounted = mount({ fallback: () => true });
  await mounted.button().onClick();
  assert.equal(mounted.button().children, "Odkaz skopírovaný");
  assert.equal(mounted.removed(), true);
});

test("native share failure falls back to copying and cancellation leaves the button alone", async () => {
  const copied = [];
  const clipboard = { writeText: async (value) => copied.push(value) };
  const failed = mount({
    clipboard,
    nativeShare: async () => {
      throw Error("Share blocked");
    },
  });
  await failed.button().onClick();
  assert.equal(failed.button().children, "Odkaz skopírovaný");
  assert.deepEqual(copied, [url]);

  const cancelled = mount({
    clipboard,
    nativeShare: async () => {
      throw new DOMException("Cancelled", "AbortError");
    },
  });
  await cancelled.button().onClick();
  assert.equal(cancelled.button().children, "Zdieľať");
  assert.deepEqual(copied, [url]);
});
