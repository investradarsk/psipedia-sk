import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "public-fallbacks.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "../../test-results/public-fallbacks-report" }],
  ],
  outputDir: "../../test-results/public-fallbacks",
  timeout: 45_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: "http://127.0.0.1:5178",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    deviceScaleFactor: 1,
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: ["--no-sandbox", "--disable-gpu", "--no-zygote"],
        }
      : undefined,
  },
  projects: [{ name: "chromium-public-fallbacks", use: { browserName: "chromium" } }],
  webServer: {
    cwd: process.cwd(),
    command: "npx vite --config tests/e2e/fixtures/public-fallbacks/vite.config.ts",
    url: "http://127.0.0.1:5178/tests/e2e/fixtures/public-fallbacks/index.html",
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
});
