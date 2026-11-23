import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { directoryEmptyQueryRedirect, directoryPageHref } from "../lib/directory-query.ts";

const route = readFileSync("app/adresar/[category]/page.tsx", "utf8");
const compiled = ts.transpileModule(route, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;

test("category redirects an out-of-range page to the available page with filters intact", async () => {
  let availablePage = 2;
  const exports = {};
  const redirect = (url) => {
    throw new Error(url);
  };
  new Function("require", "exports", compiled)((name) => {
    switch (name) {
      case "next/navigation":
        return { redirect };
      case "@/lib/directory":
        return { getDirectoryCategory: (slug) => ({ slug }) };
      case "@/lib/public-read-retry":
        return { retryTransientPublicRead: (read) => read() };
      case "@/lib/directory-query":
        return { directoryEmptyQueryRedirect, directoryPageHref };
      case "@/lib/directory-store":
        return {
          parseDirectoryFilters: (params) => ({
            query: params.q ?? "",
            page: Number(params.page ?? 1),
            region: params.region ?? "",
            category: "",
            district: "",
            city: "",
            service: "",
            breed: "",
            fciGroup: "",
            organization: "",
            profileType: "",
            sort: "recommended",
          }),
          listPublishedDirectoryProfiles: async ({ filters }) => ({
            page: Math.min(filters.page, availablePage),
            profiles: [],
          }),
        };
      case "@/lib/listing-seo":
        return { resolveListingIndexPolicy: () => ({ kind: "query" }) };
      case "react/jsx-runtime":
        return {
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
        };
      default:
        return {};
    }
  }, exports);
  const visit = (query) =>
    exports.default({
      params: Promise.resolve({ category: "veterinari" }),
      searchParams: Promise.resolve(query),
    });
  await assert.rejects(visit({ page: "99", q: "klinika" }), {
    message: "/adresar/veterinari?q=klinika&page=2",
  });
  await assert.doesNotReject(visit({ page: "2", q: "klinika" }));
  availablePage = 1;
  await assert.rejects(visit({ page: "99" }), { message: "/adresar/veterinari" });
});
