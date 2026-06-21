import { FullConfig } from '@playwright/test';

/**
 * Playwright 全局初始化
 * - 检查环境配置
 * - 预置测试数据（如需要）
 */
// 默认 Mock 模式，与 playwright.config.ts / auth.fixture.ts / api-mock.ts 保持一致
const isMockMode = (process.env.E2E_MODE || 'mock') === 'mock';

async function globalSetup(config: FullConfig) {
  console.log('🎭 E2E 测试全局初始化');

  // 默认端口 3002，与 playwright.config.ts 保持一致，避免与本地开发服务冲突
  const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3002';
  const gatewayURL = process.env.E2E_GATEWAY_URL;
  
  console.log(`   模式: ${isMockMode ? 'Mock' : '真实 Gateway'}`);
  console.log(`   BaseURL: ${baseURL}`);
  
  if (!isMockMode && !gatewayURL) {
    console.warn('⚠️  警告：真实 Gateway 模式下未配置 E2E_GATEWAY_URL');
  }
  
  // TODO: 如需在测试前执行全局初始化（如创建测试账号），可在此添加
}

export default globalSetup;
