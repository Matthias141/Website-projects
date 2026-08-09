import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // sculpture animation state is easier to reason about run serially
  retries: 0, // a WebGL crash retrying silently would hide the exact bug we're chasing
  reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
  use: {
    baseURL: process.env.SITE_URL || 'https://website-projects-omega.vercel.app',
    screenshot: 'on', // every test, not just failures — these ARE the deliverable
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      // matches the resolution of the actual iPhone screen recordings used
      // throughout this project's manual QA so far
      name: 'mobile-iphone',
      use: { ...devices['iPhone 14 Pro Max'] },
    },
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
