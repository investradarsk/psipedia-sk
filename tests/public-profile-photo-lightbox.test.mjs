import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("every public profile hero uses the existing PhotoSwipe controller rather than a second modal", () => {
  const gallery = read("components/public-visual-system/public-photo-gallery.tsx");
  const barrel = read("components/public-visual-system/index.ts");
  const enhancer = read("components/public-visual-system/public-photoswipe-enhancer.tsx");
  const styles = read("components/detail-primitives/detail-primitives.module.css");

  assert.match(gallery, /export function PublicPhotoLightboxLink/);
  assert.match(gallery, /<PublicPhotoSwipeEnhancer>/);
  assert.match(gallery, /data-profile-photo-lightbox/);
  assert.match(gallery, /data-pswp-gallery-item/);
  assert.match(gallery, /const href = \/\^\(\?:https\?:/);
  assert.match(barrel, /PublicPhotoLightboxLink/);
  assert.match(enhancer, /import\("photoswipe\/lightbox"\)/);
  assert.match(styles, /\.heroMedia a\[data-profile-photo-lightbox\]/);
  assert.match(styles, /cursor: zoom-in/);
  assert.match(styles, /:focus-visible/);
  for (const path of [
    "components/directory-profile-detail.tsx",
    "components/public-profile/public-profile-hero.tsx",
    "components/adoption-detail.tsx",
    "components/lost-found-dog-detail.tsx",
    "app/plemena/[slug]/page.tsx",
  ]) {
    const source = read(path);
    assert.match(
      source,
      /<PublicPhotoLightboxLink src=\{/,
      `Missing shared hero photo link in ${path}`,
    );
    assert.match(source, /<\/PublicPhotoLightboxLink>/);
  }
});

test("profile photo link keeps a native full-size image URL and omits links for invalid sources", async () => {
  const [{ default: ts }, React, { renderToStaticMarkup }] = await Promise.all([
    import("typescript"),
    import("react"),
    import("react-dom/server"),
  ]);
  const compiled = ts.transpileModule(
    read("components/public-visual-system/public-photo-gallery.tsx"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const jsx = await import("react/jsx-runtime");
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsx;
    if (name === "@/lib/responsive-media") return { responsiveMediaSrcSet: () => undefined };
    if (name === "./public-photoswipe-enhancer")
      return { PublicPhotoSwipeEnhancer: ({ children }) => children };
    if (name.endsWith(".module.css"))
      return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    throw Error("Unexpected import: " + name);
  }, exports);
  const render = (src) =>
    renderToStaticMarkup(
      React.createElement(
        exports.PublicPhotoLightboxLink,
        { src, alt: "Profilová fotografia" },
        React.createElement("span", { "data-original-image": true }, "Fotografia"),
      ),
    );
  const valid = render("/media/profile.jpg");
  assert.match(valid, /href="\/media\/profile.jpg"/);
  assert.match(valid, /aria-label="Zväčšiť fotografiu: Profilová fotografia"/);
  assert.match(valid, /data-pswp-gallery-item="true"/);
  assert.match(valid, /data-original-image="true"/);
  assert.doesNotMatch(valid, /target="_blank"/, "Fallback should remain a standard same-tab link");
  assert.equal(render("javascript:alert(1)"), '<span data-original-image="true">Fotografia</span>');
  assert.equal(
    render("//untrusted.example/photo.jpg"),
    '<span data-original-image="true">Fotografia</span>',
  );
});

test("all profile photo crops and no-photo placeholders stay in their original templates", () => {
  const directory = read("components/directory-profile-detail.tsx");
  const organization = read("components/public-profile/public-profile-hero.tsx");
  const adoption = read("components/adoption-detail.tsx");
  const lostFound = read("components/lost-found-dog-detail.tsx");
  const breed = read("app/plemena/[slug]/page.tsx");
  for (const file of [directory, organization, adoption, lostFound]) {
    assert.match(file, /<ImageDisplay/);
    assert.match(file, /<PublicMediaFallback/);
    assert.match(file, /fallbackOnError/);
  }
  assert.match(directory, /config=\{presentation\.detailImageDisplay\}/);
  assert.match(organization, /config=\{imageConfig\}/);
  assert.match(adoption, /config=\{dog\.detailImageDisplay\}/);
  assert.match(lostFound, /config=\{report\.detailImageDisplay\}/);
  assert.match(breed, /<BreedPhoto/);
  assert.match(breed, /data-testid="breed-hero-image"/);
  assert.match(breed, /<PublicMediaFallback/);
});

test("hero lightboxes defer requests until intent, handle cold clicks and clean up image listeners", async () => {
  const { default: ts } = await import("typescript");
  const compiled = ts.transpileModule(
    read("components/public-visual-system/public-photoswipe-enhancer.tsx"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    },
  ).outputText;
  function mount({ hero = true, reject = false } = {}) {
    const handlers = new Map();
    const imageHandlers = new Map();
    const counts = { imports: 0, opens: 0, destroyed: 0, observers: 0, fallback: 0 };
    let cleanup;
    class Target {
      closest() {
        return anchor;
      }
    }
    const image = {
      complete: false,
      naturalWidth: 640,
      naturalHeight: 480,
      addEventListener: (event, handler) => imageHandlers.set(event, handler),
      removeEventListener: (event) => imageHandlers.delete(event),
    };
    const anchor = new Target();
    Object.assign(anchor, {
      dataset: {},
      target: "",
      href: "/media/profile.jpg",
      hasAttribute: () => false,
      querySelector: () => image,
    });
    const anchors = [anchor];
    anchors.item = (index) => anchors[index];
    const gallery = {
      querySelector: () => (hero ? anchor : null),
      querySelectorAll: () => anchors,
      contains: () => true,
      addEventListener: (event, handler) => handlers.set(event, handler),
      removeEventListener: (event) => handlers.delete(event),
    };
    const exports = {};
    new Function("require", "exports", "Element", "IntersectionObserver", "window", compiled)(
      (name) => {
        if (name === "react")
          return {
            useRef: () => ({ current: gallery }),
            useEffect: (effect) => {
              cleanup = effect();
            },
          };
        if (name === "react/jsx-runtime") return { jsx: () => null };
        if (name === "photoswipe/style.css") return {};
        if (name === "photoswipe/lightbox") {
          counts.imports++;
          if (reject) throw Error("Simulated chunk failure");
          return class {
            init() {}
            loadAndOpen() {
              counts.opens++;
            }
            destroy() {
              counts.destroyed++;
            }
          };
        }
        throw Error("Unexpected import: " + name);
      },
      exports,
      Target,
      class {
        constructor() {
          counts.observers++;
        }
        observe() {}
        disconnect() {}
      },
      {
        location: {
          assign: () => {
            counts.fallback++;
          },
        },
      },
    );
    exports.PublicPhotoSwipeEnhancer({ children: null });
    return {
      counts,
      handlers,
      imageHandlers,
      cleanup: () => cleanup(),
      click: (extras = {}) => {
        let prevented = false;
        handlers.get("click")({
          target: anchor,
          button: 0,
          preventDefault: () => {
            prevented = true;
          },
          ...extras,
        });
        return prevented;
      },
    };
  }
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const hero = mount();
  await settle();
  assert.equal(hero.counts.imports, 0, "visible hero does not download the controller");
  assert.equal(hero.counts.observers, 0);
  assert.equal(hero.click({ ctrlKey: true }), false);
  assert.equal(hero.counts.imports, 0, "modified links keep native behavior");
  assert.equal(hero.click(), true);
  await settle();
  assert.equal(hero.counts.imports, 1);
  assert.equal(hero.counts.opens, 1, "first touch/click opens after the chunk arrives");
  assert.equal(hero.imageHandlers.size, 1);
  hero.cleanup();
  assert.equal(hero.handlers.size, 0);
  assert.equal(hero.imageHandlers.size, 0, "unmount removes pending image load listener");
  assert.equal(hero.counts.destroyed, 1);
  for (const event of ["pointerover", "focusin"]) {
    const item = mount();
    item.handlers.get(event)();
    await settle();
    assert.equal(item.counts.imports, 1);
    assert.equal(item.counts.opens, 0, "intent preloads without opening");
    item.cleanup();
  }
  const failed = mount({ reject: true });
  failed.click();
  await settle();
  assert.equal(failed.counts.fallback, 1);
  failed.cleanup();
  const gallery = mount({ hero: false });
  assert.equal(gallery.counts.observers, 1, "galleries retain viewport preparation");
  gallery.cleanup();
});
