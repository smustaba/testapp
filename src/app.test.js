const request = require('supertest');
process.env.DB_PROVIDER = 'memory';
const { app, server, dbReadyPromise, closeDb } = require('../src/app');

beforeAll(async () => {
  await dbReadyPromise;
});

afterAll(async () => {
  server.close();
  await closeDb();
});

describe('GET /health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /ready', () => {
  it('returns ready true', async () => {
    const res = await request(app).get('/ready');
    expect(res.statusCode).toBe(200);
    expect(res.body.ready).toBe(true);
  });
});

describe('GET /api/items', () => {
  it('returns an array of items', async () => {
    const res = await request(app).get('/api/items');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(3);
  });
});

describe('GET /api/items/:id', () => {
  it('returns a single item', async () => {
    const res = await request(app).get('/api/items/1');
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it('returns 404 for unknown item', async () => {
    const res = await request(app).get('/api/items/99');
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/items', () => {
  it('creates a new item', async () => {
    const res = await request(app)
      .post('/api/items')
      .send({ name: 'Widget D', price: 14.99 });
    expect(res.statusCode).toBe(201);
    expect(res.body.name).toBe('Widget D');
  });

  it('returns 400 when body is incomplete', async () => {
    const res = await request(app).post('/api/items').send({ name: 'Bad' });
    expect(res.statusCode).toBe(400);
  });
});
