import { readFileSync } from "node:fs";
import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const { d1, r2 } = hostingConfig;
const wranglerConfig = JSON.parse(
  readFileSync(new URL("./wrangler.jsonc", import.meta.url), "utf8"),
) as {
  compatibility_date: string;
  version_metadata?: { binding?: string };
  d1_databases?: Array<{
    binding: string;
    database_name: string;
    database_id: string;
    migrations_dir?: string;
  }>;
  r2_buckets?: Array<{ binding: string; bucket_name: string }>;
};

const canonicalD1 = d1
  ? wranglerConfig.d1_databases?.find((database) => database.binding === d1)
  : undefined;
const canonicalR2 = r2
  ? wranglerConfig.r2_buckets?.find((bucket) => bucket.binding === r2)
  : undefined;
const versionMetadataBinding = wranglerConfig.version_metadata?.binding;

if (d1 && !canonicalD1) throw new Error(`wrangler.jsonc is missing canonical D1 binding ${d1}`);
if (r2 && !canonicalR2) throw new Error(`wrangler.jsonc is missing canonical R2 binding ${r2}`);
if (!versionMetadataBinding) throw new Error("wrangler.jsonc is missing version_metadata.binding");

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const isExplicitLocalE2eBootstrap = process.env.PSIPEDIA_E2E_LOCAL_BOOTSTRAP === "1";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_date: wranglerConfig.compatibility_date,
  version_metadata: { binding: versionMetadataBinding },
  // Production keeps Cloudflare Access from wrangler.jsonc. Only the explicit
  // local E2E bootstrap disables that Worker-level gate so the existing
  // localhost preview admin identity can reach the normal admin API routes.
  ...(isExplicitLocalE2eBootstrap ? { vars: { AUTH_MODE: "local-e2e-preview" } } : {}),
  d1_databases: canonicalD1
    ? [
        {
          ...canonicalD1,
          // The Vite/Miniflare generated config resolves migrations relative
          // to its own location; production keeps ./drizzle in wrangler.jsonc.
          migrations_dir: "../../drizzle",
        },
      ]
    : [],
  r2_buckets: canonicalR2 ? [canonicalR2] : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
