import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "admin-image-review-v2.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open:"never", outputFolder:"../../test-results/image-review-v2-report" }]],
  outputDir: "../../test-results/image-review-v2",
  timeout: 45_000,
  expect: {timeout: 12_000},
  use: {baseURL:"http://127.0.0.1:5175", trace:"retain-on-failure", screenshot:"only-on-failure", deviceScaleFactor:1},
  projects:[{name:"chromium-image-review",use:{browserName:"chromium"}}],
  webServer: {
    cwd: process.cwd(),
    command:"npx vite --config tests/e2e/fixtures/admin-image-review-v2/vite.config.ts",
    url:"http://127.0.0.1:5175/tests/e2e/fixtures/admin-image-review-v2/index.html",
    reuseExistingServer:false,
    timeout:90_000
  }
});
