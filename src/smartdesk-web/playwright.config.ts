import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright Configuration for SmartDesk Web E2E Tests
 * 
 * 支持两种运行模式：
 * - Mock 模式 (E2E_MODE=mock): 使用 MSW 拦截 API 请求
 * - 真实 Gateway 模式 (E2E_MODE=real): 调用真实的 Gateway 服务
 * 
 * @see https://playwright.dev/docs/test-configuration
 */

// 从环境变量读取运行模式，默认 mock
const e2eMode = process.env.E2E_MODE || 'mock';
const isMockMode = e2eMode === 'mock';

// 根据模式设置 baseURL
const baseURL = process.env.E2E_BASE_URL || (isMockMode 
  ? 'http://localhost:3000'  // Mock 模式下本地开发服务器
  : 'http://localhost:3001'    // 真实 Gateway 模式下 Gateway 服务地址
);

export default defineConfig({
  testDir: './e2e/tests',
  
  // 完全并行运行测试
  fullyParallel: true,
  
  // 失败时禁止重复运行
  forbidOnly: !!process.env.CI,
  
  // 重试配置：CI 环境重试 2 次，本地不重试
  retries: process.env.CI ? 2 : 0,
  
  // 并行工作进程数
  workers: process.env.CI ? 1 : undefined,
  
  // 测试报告配置
  reporter: [
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'e2e/results/junit-report.xml' }],
    ['list']
  ],
  
  // 输出目录
  outputDir: 'e2e/results',
  
  // 全局测试配置
  use: {
    // 测试站点基础 URL
    baseURL,
    
    // 浏览器上下文选项
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    // 测试超时
    actionTimeout: 15000,
    navigationTimeout: 30000,
    
    // 传递模式信息到测试
    launchOptions: {
      // 在 CI 中需要 headless 模式
      headless: !!process.env.CI,
    },
  },

  // 浏览器项目配置
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],

  // 开发服务器配置（仅在 Mock 模式下启动）
  webServer: isMockMode ? {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  } : undefined,

  // 全局设置
  globalSetup: './e2e/global-setup.ts',
  
  // 测试匹配模式
  testMatch: /\.spec\.(ts|js)$/, 
});
