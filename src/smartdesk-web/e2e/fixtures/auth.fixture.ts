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

const USER_DISPLAY_NAMES: Record<UserRole, string> = {
  portal: '张三',
  agent: '李四',
  admin: '管理员',
};

/**
 * 生成 Mock JWT Token
 */
function generateMockToken(user: TestUser): string {
  const payload = {
    sub: user.username,
    roles: [user.role],
    exp: Date.now() + 3600 * 1000,
  };
  return `mock_jwt_${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
}

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
// 默认 Mock 模式，与 playwright.config.ts / api-mock.ts / global-setup.ts 保持一致
const isMockMode = (process.env.E2E_MODE || 'mock') === 'mock';

export const test = base.extend<TestFixtures>({
  isMockMode: async ({}, use) => {
    await use(isMockMode);
  },

  auth: async ({ page, isMockMode }, use) => {
    const auth = {
      /**
       * 登录指定角色
       */
      login: async (role: UserRole) => {
        const user = TEST_USERS[role];
        const displayName = USER_DISPLAY_NAMES[role];

        // Mock 模式：直接设置 localStorage
        if (isMockMode) {
          // 先导航到应用 origin，否则 about:blank 无法访问 localStorage
          await page.goto('/');
          const token = generateMockToken(user);
          await page.evaluate(
            ({ token, role, displayName }) => {
              localStorage.setItem('auth_token', token);
              localStorage.setItem('user_role', role);
              localStorage.setItem('user_name', displayName);
            },
            { token, role: user.role, displayName }
          );
          return;
        }

        // 真实模式：走登录流程
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
          // 先导航到应用 origin，否则 about:blank 无法访问 localStorage
          await page.goto('/');
          await page.evaluate(() => {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_role');
            localStorage.removeItem('user_name');
          });
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
