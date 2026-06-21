import { FullConfig } from '@playwright/test';

/**
 * Playwright 全局设置
 * 
 * 在测试开始前执行一次，用于：
 * - 验证测试环境配置
 * - 初始化全局状态
 * - 创建测试数据（如果需要）
 */

async function globalSetup(config: FullConfig) {
  const e2eMode = process.env.E2E_MODE || 'mock';
  const baseURL = process.env.E2E_BASE_URL || config.webServer?.url || 'http://localhost:3000';

  console.log('═══════════════════════════════════════════════════════');
  console.log('  SmartDesk Web E2E Tests - Global Setup');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Mode: ${e2eMode.toUpperCase()}`);
  console.log(`  Base URL: ${baseURL}`);
  console.log('═══════════════════════════════════════════════════════\n');

  // 验证环境变量配置
  if (e2eMode === 'real') {
    if (!process.env.E2E_GATEWAY_URL) {
      console.warn('⚠️  Warning: E2E_GATEWAY_URL not set, using default');
    }
  }

  // 可选：验证目标服务是否可达
  // const response = await fetch(`${baseURL}/health`);
  // if (!response.ok) {
  //   throw new Error(`Target service at ${baseURL} is not ready`);
  // }
}

export default globalSetup;
