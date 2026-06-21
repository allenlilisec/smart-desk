import { test as base, expect } from '@playwright/test';

/**
 * 测试账号类型
 */
export type UserRole = 'portal' | 'agent' | 'admin';

export interface TestUser {
  username: string;
  password: string;
  role: UserRole;
}

/**
 * 从环境变量读取测试账号
 */
export const TEST_USERS: Record<UserRole, TestUser> = {
  portal: {
    username: process.env.E2E_PORTAL_USER || 'zhangsan',
    password: process.env.E2E_PORTAL_PASSWORD || 'password123',
    role: 'portal',
  },
  agent: {
    username: process.env.E2E_AGENT_USER || 'lisi',
    password: process.env.E2E_AGENT_PASSWORD || 'password123',
    role: 'agent',
  },
  admin: {
    username: process.env.E2E_ADMIN_USER || 'admin',
    password: process.env.E2E_ADMIN_PASSWORD || 'password123',
    role: 'admin',
  },
};

/**
 * 扩展的 test 类型，包含登录状态 fixture
 */
export type TestFixtures = {
  auth: {
    login: (role: UserRole) => Promise<void>;
    logout: () => Promise<void>;
    getUser: (role: UserRole) => TestUser;
  };
  isMockMode: boolean;
};

/**
 * 扩展 test，添加认证 fixture
 */
export const test = base.extend<TestFixtures>({
  isMockMode: async ({}, use) => {
    await use(process.env.E2E_MODE === 'mock');
  },

  auth: async ({ page, isMockMode }, use) => {
    const auth = {
      /**
       * 登录指定角色
       * TODO: 根据实际登录流程实现
       */
      login: async (role: UserRole) => {
        const user = TEST_USERS[role];

        // Mock 模式：直接设置 cookie / localStorage
        if (isMockMode) {
          await page.evaluate((userData) => {
            localStorage.setItem('e2e_auth_user', JSON.stringify(userData));
          }, user);
          return;
        }

        // 真实模式：走登录流程
        // TODO: 根据实际登录页面实现
        await page.goto('/login');
        await page.fill('[name="username"]', user.username);
        await page.fill('[name="password"]', user.password);
        await page.click('button[type="submit"]');
        await page.waitForURL(/\/(portal|agent|admin)/);
      },

      /**
       * 登出
       */
      logout: async () => {
        if (isMockMode) {
          await page.evaluate(() => {
            localStorage.removeItem('e2e_auth_user');
          });
        } else {
          // TODO: 根据实际登出流程实现
          await page.goto('/logout');
        }
      },

      /**
       * 获取测试用户信息
       */
      getUser: (role: UserRole) => TEST_USERS[role],
    };

    await use(auth);
  },
});

export { expect };
