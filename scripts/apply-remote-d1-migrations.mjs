import { spawnSync } from "node:child_process";
import fs from "node:fs";

const hostingConfig = JSON.parse(
  fs.readFileSync(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
);

if (typeof hostingConfig.d1 !== "string" || !hostingConfig.d1) {
  throw new Error(".openai/hosting.json must declare the canonical D1 binding");
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  npx,
  [
    "wrangler",
    "d1",
    "migrations",
    "apply",
    hostingConfig.d1,
    "--remote",
    "--config",
    "dist/server/wrangler.json",
  ],
  { stdio: "inherit", env: process.env },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
