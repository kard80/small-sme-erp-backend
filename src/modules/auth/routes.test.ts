import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAuthRouter } from './routes';
import { fallbackErrorHandler } from '../../shared/http';
import { login } from './service';

const app = express();
app.use(express.json());
app.use('/api/v1/auth', createAuthRouter());
app.use(fallbackErrorHandler);

const auth = () => ({ Authorization: `Bearer ${login('admin', '1234').accessToken}` });

describe('auth routes', () => {
  it('login validates the body and credentials', async () => {
    expect((await request(app).post('/api/v1/auth/login').send({})).status).toBe(400);
    expect((await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'x' })).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: '1234' })).status).toBe(200);
  });

  it('refresh and me work with valid tokens', async () => {
    const pair = login('admin', '1234');
    expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: pair.refreshToken })).status).toBe(200);
    expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: 'junk' })).status).toBeGreaterThanOrEqual(400);
    const me = await request(app).get('/api/v1/auth/me').set(auth());
    expect(me.body.user.username).toBe('admin');
  });
});

