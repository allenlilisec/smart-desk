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
export const test = base.extend<TestFixtures>({
  isMockMode: async ({}, use) => {
    await use(process.env.E2E_MODE === 'mock');
  },

  auth: async ({ page, isMockMode }, use) => {
    const auth = {
      /**
       * 登录指定角色
       */
      login: async (role: UserRole) => {
        const user = TEST_USERS[role];
        const displayName = USER_DISPLAY_NAMES[role];

        if (isMockMode) {
          // Mock 模式：通过 init script 在页面加载前写入 localStorage
          const token = generateMockToken(user);
          await page.addInitScript(
            ({ token, role, displayName }) => {
              localStorage.setItem('auth_token', token);
              localStorage.setItem('user_role', role);
              localStorage.setItem('user_name', displayName);
            },
            { token, role: user.role, displayName }
          );
          return;
        }

        // 真实 Gateway 模式：通过登录页表单登录
        const loginPath = role === 'portal' ? '/portal/login' : `/${role}/login`;
        await page.goto(loginPath);
        await page.fill('[data-testid="username-input"]', user.username);
        await page.fill('[data-testid="password-input"]', user.password);
        await page.click('[data-testid="login-button"]');
        await page.waitForURL(/\/(portal|agent|admin)$/);
      },

      /**
       * 登出
       */
      logout: async () => {
        try {
          await page.evaluate(() => {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_role');
            localStorage.removeItem('user_name');
          });
        } catch {
          // 页面未加载时忽略清理错误
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
