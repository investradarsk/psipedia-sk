import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir:'./e2e',testMatch:'events-fallback-images.spec.ts',workers:1,retries:0,reporter:'list',
  outputDir:'../outputs/redesign4/test-results',
  projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 7']}}],
  use:{baseURL:'http://127.0.0.1:5174',launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']}:{}},
  webServer:{cwd:fileURLToPath(new URL('..',import.meta.url)),command:'node tests/helpers/events-fallback-preview.mjs',url:'http://127.0.0.1:5174',reuseExistingServer:!process.env.CI,timeout:30000},
});
