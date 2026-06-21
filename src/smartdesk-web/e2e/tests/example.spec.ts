/**
 * 示例/主干用例骨架
 * 
 * 本文件用于验证 Playwright 配置是否正确运行。
 * 包含基本的页面加载测试。
 * 
 * @see SUP-493
 */

import { test, expect } from '@playwright/test';

// ═══════════════════════════════════════════════════════════
// 基础测试套件
// ═══════════════════════════════════════════════════════════

test.describe('示例测试 - 验证 Playwright 配置', () => {
  
  // ═══════════════════════════════════════════════════════
  // 用例 1：首页可访问
  // ═══════════════════════════════════════════════════════
  
  test('首页可访问并加载', async ({ page }) => {
    // 访问首页
    await page.goto('/');
    
    // 等待页面加载完成
    await page.waitForLoadState('networkidle');
    
    // 验证页面标题存在
    const title = await page.title();
    console.log('页面标题:', title);
    
    // 验证页面有内容
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
  });
  
  // ═══════════════════════════════════════════════════════
  // 用例 2：截图功能
  // ═══════════════════════════════════════════════════════
  
  test('截图功能正常', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // 截图并验证文件生成
    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toBeTruthy();
    expect(screenshot.length).toBeGreaterThan(0);
  });
  
  // ═══════════════════════════════════════════════════════
  // 用例 3：元素选择器
  // ═══════════════════════════════════════════════════════
  
  test('元素选择器工作正常', async ({ page }) => {
    await page.goto('/');
    
    // 验证 body 元素存在
    const body = page.locator('body');
    await expect(body).toBeVisible();
    
    // 验证 html 标签存在
    const html = page.locator('html');
    await expect(html).toBeVisible();
  });
  
  // ═══════════════════════════════════════════════════════
  // 用例 4：浏览器导航
  // ═══════════════════════════════════════════════════════
  
  test('浏览器导航功能正常', async ({ page }) => {
    // 访问首页
    await page.goto('/');
    const homeUrl = page.url();
    
    // 验证 URL 格式
    expect(homeUrl).toContain('localhost');
    
    // 验证可以前进后退（如果有历史）
    await page.goto('/portal');
    const portalUrl = page.url();
    expect(portalUrl).not.toBe(homeUrl);
  });
  
  // ═══════════════════════════════════════════════════════
  // 用例 5：响应式视口
  // ═══════════════════════════════════════════════════════
  
  test('响应式视口功能正常', async ({ page }) => {
    // 设置桌面视口
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    
    // 设置移动视口
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await expect(page.locator('body')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════
// Mock/真实模式测试
// ═══════════════════════════════════════════════════════════

test.describe('模式检测', () => {
  
  test('检测当前运行模式', async () => {
    const mode = process.env.E2E_MODE || 'mock';
    console.log(`当前运行模式: ${mode}`);
    
    expect(['mock', 'real']).toContain(mode);
  });
  
  test('检测基础 URL', async () => {
    const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
    console.log(`基础 URL: ${baseURL}`);
    
    expect(baseURL).toBeTruthy();
    expect(baseURL.startsWith('http')).toBeTruthy();
  });
});
