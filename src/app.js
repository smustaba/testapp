const express = require('express');
const {
  initDb,
  getAllItems,
  getItemById,
  createItem,
  closeDb,
} = require('./db/itemsDb');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_VERSION = process.env.APP_VERSION || '1.0.0';
let isDbReady = false;

const dbReadyPromise = initDb()
  .then(() => {
    isDbReady = true;
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
  });

app.use(express.json());

// Health check — used by Kubernetes liveness/readiness probes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: APP_VERSION });
});

// Readiness probe
app.get('/ready', (req, res) => {
  if (!isDbReady) {
    return res.status(503).json({ ready: false });
  }

  res.json({ ready: true });
});

app.use('/api', (req, res, next) => {
  if (!isDbReady) {
    return res.status(503).json({ error: 'Service not ready' });
  }

  next();
});

// Sample REST endpoints
app.get('/api/items', async (req, res, next) => {
  try {
    const items = await getAllItems();
    res.json(items);
  } catch (error) {
    next(error);
  }
});

app.get('/api/items/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 1) {
    return res.status(404).json({ error: 'Item not found' });
  }

  try {
    const item = await getItemById(id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
});

app.post('/api/items', async (req, res, next) => {
  const { name, price } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'name and price are required' });
  }

  if (typeof price !== 'number' || price <= 0) {
    return res.status(400).json({ error: 'price must be a positive number' });
  }

  try {
    const item = await createItem(name, price);
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (version ${APP_VERSION})`);
});

module.exports = { app, server, dbReadyPromise, closeDb };
