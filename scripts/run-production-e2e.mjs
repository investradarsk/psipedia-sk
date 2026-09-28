import { spawnSync } from "node:child_process";
import { SITE_URL } from "../config/public-site.ts";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  npx,
  ["playwright", "test", "--grep", "@production", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, E2E_BASE_URL: SITE_URL },
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
