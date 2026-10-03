import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1600, height: 1050 },
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3001",
    url: "http://127.0.0.1:3001/api/book",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      SCRAPBOOK_STORAGE_DIR: ".test-storage",
      SCRAPBOOK_TEST_MODE: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
