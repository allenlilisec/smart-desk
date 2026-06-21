import { defineConfig, devices } from '@playwright/test';
import path from 'path';

// 从环境变量读取配置，支持 Mock / 真实 Gateway 切换
const isMockMode = process.env.E2E_MODE === 'mock';
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const gatewayURL = process.env.E2E_GATEWAY_URL || 'http://localhost:8080';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: isMockMode
    ? {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
  // 全局配置，可通过 test.use() 覆盖
  globalSetup: require.resolve('./global-setup.ts'),
});
