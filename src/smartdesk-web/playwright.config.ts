import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright 配置文件
 * 支持 Mock 模式和真实 Gateway 模式
 */

// 从环境变量读取配置，支持 Mock 模式和真实 Gateway 模式
const isMockMode = process.env.E2E_MODE === 'mock'
const baseURL = process.env.BASE_URL || 'http://localhost:3000'
const gatewayURL = process.env.GATEWAY_URL || 'http://localhost:8080'

export default defineConfig({
  testDir: './e2e',
  
  // 测试文件匹配模式
  testMatch: ['**/*.spec.ts'],
  
  // 测试超时
  timeout: 30 * 1000,
  
  // 期望超时
  expect: {
    timeout: 5000,
  },
  
  // 报告配置
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  
  // 共享配置
  use: {
    // 基础 URL
    baseURL,
    
    // 是否跟踪每次测试
    trace: 'on-first-retry',
    
    // 截图配置
    screenshot: 'only-on-failure',
    
    // 视频配置
    video: 'retain-on-failure',
    
    // 视口大小
    viewport: { width: 1280, height: 720 },
    
    // 测试环境变量
    env: {
      E2E_MODE: isMockMode ? 'mock' : 'gateway',
      GATEWAY_URL: gatewayURL,
    },
  },
  
  // 项目配置
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
  
  // Web 服务器配置（开发服务器）
  webServer: isMockMode
    ? {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      }
    : undefined,
  
  // 输出目录
  outputDir: './test-results/',
})
