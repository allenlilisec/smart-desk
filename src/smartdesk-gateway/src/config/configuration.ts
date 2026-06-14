export const DEFAULT_JWT_SECRET = 'change-me-in-production';

export function validateProductionConfig(): void {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'production') {
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret || secret === DEFAULT_JWT_SECRET) {
    throw new Error(
      'JWT_SECRET must be set to a non-default value when NODE_ENV=production',
    );
  }
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET must be at least 32 bytes when NODE_ENV=production');
  }
}

export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwt: {
    secret: process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET,
    accessTtlSeconds: parseInt(process.env.JWT_ACCESS_TTL_SECONDS ?? '900', 10),
    refreshTtlSeconds: parseInt(process.env.JWT_REFRESH_TTL_SECONDS ?? '604800', 10),
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    enabled: process.env.REDIS_ENABLED === 'true',
  },
  org: {
    defaultOrgId: process.env.DEFAULT_ORG_ID ?? 'default',
  },
  cors: {
    origins: (process.env.CORS_ORIGINS ?? 'http://localhost:3001')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
  throttler: {
    authTtlMs: parseInt(process.env.AUTH_THROTTLE_TTL_MS ?? '60000', 10),
    authLimit: parseInt(process.env.AUTH_THROTTLE_LIMIT ?? '5', 10),
  },
});
