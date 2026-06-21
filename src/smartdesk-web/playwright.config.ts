import { defineConfig, devices } from '@playwright/test';

// 默认 Mock 模式，与 auth.fixture.ts / api-mock.ts / global-setup.ts 保持一致
const isMockMode = (process.env.E2E_MODE || 'mock') === 'mock';

// 从环境变量读取配置，支持 Mock / 真实 Gateway 切换
// 默认使用 3002 端口，避免与本地开发服务（3000）冲突
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3002';

export default defineConfig({
  testDir: './e2e/tests',
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
        command: 'npm run e2e:dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
  // 全局配置，可通过 test.use() 覆盖
  globalSetup: require.resolve('./e2e/global-setup.ts'),
});
