import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("admin query cache is short-lived, memory-only and never retries privileged mutations", () => {
  const provider = read("components/admin-query-provider.tsx");
  const layout = read("app/admin/layout.tsx");
  assert.match(provider, /@tanstack\/react-query/);
  assert.match(provider, /staleTime:\s*20_000/);
  assert.match(provider, /gcTime:\s*60_000/);
  assert.match(provider, /mutations:\s*\{ retry: false \}/);
  assert.doesNotMatch(provider, /localStorage|sessionStorage|persistQueryClient/);
  assert.match(layout, /<AdminQueryProvider>\{children\}<\/AdminQueryProvider>/);
});

test("admin events query keeps canonical write APIs and uses cancellable filter and page keys", () => {
  const ui = read("components/admin-event-dashboard.tsx");
  assert.match(ui, /useQuery\(/);
  assert.match(ui, /\["admin", "events", effectiveFilters, page, today\]/);
  assert.match(ui, /fetchAdminEventPage\(effectiveFilters, page, signal\)/);
  assert.match(ui, /placeholderData:\s*keepPreviousData/);
  assert.match(ui, /setSettledSearch\(filters\.query\), 250/);
  assert.match(ui, /initialData: requestKey === initialRequestKey\.current/);
  assert.match(ui, /invalidateQueries\(\{ queryKey: \["admin", "events"\], refetchType: "none" \}\)/);
  assert.match(ui, /eventQuery\.refetch\(\)/);
  assert.match(ui, /\/api\/admin\/events\/bulk/);
  assert.match(ui, /method: "PATCH"/);
  assert.match(ui, /method: "DELETE"/);
  assert.doesNotMatch(ui, /pendingRequest|setLoading\(|initialRequest\.current/);
});

test("Notion connection diagnostics use a per-scope cache; live API tests require a click", () => {
  const ui = read("components/admin-notion-connection-diagnostic.tsx");
  assert.match(ui, /useQuery\(/);
  assert.match(ui, /queryKey=\["admin","notion-connection",scope\]/);
  assert.match(ui, /queryFn:\(\{signal\}\)=>load\(scope,false,signal\)/);
  assert.match(ui, /signal,/);
  assert.match(ui, /useMutation\(/);
  assert.match(ui, /mutationFn:\(\)=>load\(scope,true\)/);
  assert.match(ui, /onClick=\{\(\)=>void test\(\)\}/);
  assert.match(ui, /credentials:"same-origin",cache:"no-store"/);
});
