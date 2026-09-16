import { spawnSync } from "node:child_process";
import fs from "node:fs";

const resourceConfig = JSON.parse(
  fs.readFileSync(new URL("../config/cloudflare-resources.json", import.meta.url), "utf8"),
);
const d1Binding = resourceConfig.d1?.binding;
if (typeof d1Binding !== "string" || !d1Binding) {
  throw new Error("config/cloudflare-resources.json must declare the canonical D1 binding");
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  npx,
  [
    "wrangler",
    "d1",
    "migrations",
    "apply",
    d1Binding,
    "--remote",
    "--config",
    "dist/server/wrangler.json",
  ],
  { stdio: "inherit", env: process.env },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
