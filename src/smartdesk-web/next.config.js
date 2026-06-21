/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // 使用 Next.js 14 稳定特性
  },
  // 配置 API 代理（开发时）
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/:path*`,
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
