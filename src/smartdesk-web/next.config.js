/** @type {import('next').NextConfig} */
const gatewayURL = process.env.E2E_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const nextConfig = {
  experimental: {
    // 使用 Next.js 14 稳定特性
  },
  // 配置 API 代理（开发时与 E2E 真实 Gateway 模式）
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${gatewayURL}/api/:path*`,
      },
    ];
  },
  // 输出配置
  distDir: 'dist',
  // 图片域名配置（如果需要）
  images: {
    domains: [],
  },
  // 环境变量前缀
  env: {
    NEXT_PUBLIC_APP_NAME: 'SmartDesk',
  },
};

module.exports = nextConfig;
