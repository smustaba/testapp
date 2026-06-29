const { Pool } = require('pg');

const SEED_ITEMS = [
  { id: 1, name: 'Widget A', price: 9.99 },
  { id: 2, name: 'Widget B', price: 19.99 },
  { id: 3, name: 'Widget C', price: 4.99 },
];

let initPromise;
let pool;
let memoryItems = [];
let nextMemoryId = 1;

function getProvider() {
  return process.env.DB_PROVIDER || 'memory';
}

function getPool() {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'itemsdb',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  return pool;
}

async function initDb() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    if (getProvider() === 'memory') {
      memoryItems = SEED_ITEMS.map((item) => ({ ...item }));
      nextMemoryId = memoryItems.length + 1;
      return;
    }

    const db = getPool();

    await db.query(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        price NUMERIC(10, 2) NOT NULL CHECK (price > 0)
      )
    `);

    const countResult = await db.query('SELECT COUNT(*)::int AS count FROM items');
    const count = countResult.rows[0].count;

    if (count === 0) {
      for (const item of SEED_ITEMS) {
        await db.query(
          'INSERT INTO items (id, name, price) VALUES ($1, $2, $3)',
          [item.id, item.name, item.price]
        );
      }

      await db.query(
        "SELECT setval(pg_get_serial_sequence('items', 'id'), (SELECT MAX(id) FROM items))"
      );
    }
  })();

  return initPromise;
}

async function getAllItems() {
  if (getProvider() === 'memory') {
    return memoryItems.map((item) => ({ ...item }));
  }

  const db = getPool();
  const result = await db.query(
    'SELECT id, name, price::double precision AS price FROM items ORDER BY id ASC'
  );
  return result.rows;
}

async function getItemById(id) {
  if (getProvider() === 'memory') {
    return memoryItems.find((item) => item.id === id) || null;
  }

  const db = getPool();
  const result = await db.query(
    'SELECT id, name, price::double precision AS price FROM items WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

async function createItem(name, price) {
  if (getProvider() === 'memory') {
    const item = { id: nextMemoryId, name, price };
    nextMemoryId += 1;
    memoryItems.push(item);
    return { ...item };
  }

  const db = getPool();
  const result = await db.query(
    'INSERT INTO items (name, price) VALUES ($1, $2) RETURNING id, name, price::double precision AS price',
    [name, price]
  );
  return result.rows[0];
}

async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }

  initPromise = undefined;
  memoryItems = [];
  nextMemoryId = 1;
}

module.exports = {
  initDb,
  getAllItems,
  getItemById,
  createItem,
  closeDb,
};
