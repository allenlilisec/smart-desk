/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const gatewayURL = process.env.GATEWAY_URL || 'http://localhost:8080'
    const isMockMode = process.env.E2E_MODE === 'mock'
    
    return {
      beforeFiles: [
        // 在 Mock 模式下，API 请求由 Next.js API 路由处理
        // 在真实 Gateway 模式下，API 请求代理到 Gateway
        ...(isMockMode 
          ? []
          : [
              {
                source: '/api/v1/:path*',
                destination: `${gatewayURL}/api/v1/:path*`,
              },
            ]
        ),
      ],
    }
  },
  // 开发服务器配置
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
