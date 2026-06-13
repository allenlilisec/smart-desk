import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TraceIdInterceptor } from '../src/common/interceptors/trace-id.interceptor';

describe('Gateway auth & RBAC (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.REDIS_ENABLED = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TraceIdInterceptor());
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /healthz returns ok', () => {
    return request(app.getHttpServer()).get('/healthz').expect(200).expect({ status: 'ok' });
  });

  it('login → me → refresh → logout flow', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'requester1', password: 'req123' })
      .expect(200);

    expect(login.body.access_token).toBeDefined();
    expect(login.body.refresh_token).toBeDefined();
    expect(login.body.expires_in).toBeGreaterThan(0);

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .expect(200);

    expect(me.body.username).toBe('requester1');
    expect(me.body.roles).toContain('requester');

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: login.body.refresh_token })
      .expect(200);

    expect(refreshed.body.access_token).toBeDefined();

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${refreshed.body.access_token}`)
      .expect(204);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshed.body.access_token}`)
      .expect(401);
  });

  it('invalid login returns 401 without leaking account existence', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'nobody', password: 'bad' })
      .expect(401);

    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('requester accessing own ticket succeeds', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'requester1', password: 'req123' })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/tickets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .expect(200);
  });

  it('requester accessing another requester ticket returns 403', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'requester1', password: 'req123' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/api/v1/tickets/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .expect(403);

    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('requester accessing admin route returns 403', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'requester1', password: 'req123' })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .expect(403);
  });

  it('manager patch ticket returns 403', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'manager1', password: 'mgr123' })
      .expect(200);

    await request(app.getHttpServer())
      .patch('/api/v1/tickets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .expect(403);
  });
});
