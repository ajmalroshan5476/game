import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import dotenv from 'dotenv';
import { apiRoutes } from './routes/api.routes.js';
import { runMigrations } from './db/migrate.js';
import { runSeed } from './db/seed.js';

dotenv.config();

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

await fastify.register(cors, {
  origin: true,
  credentials: true,
});

await fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'super-secure-production-jwt-secret-key-numbergame-2026',
});

await fastify.register(sensible);

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Register API routes
await fastify.register(apiRoutes);

const port = parseInt(process.env.PORT || '4001', 10);
const host = process.env.HOST || '0.0.0.0';

export async function startServer() {
  try {
    // Ensure migrations and seed run on boot if necessary
    await runMigrations();
    await runSeed();

    await fastify.listen({ port, host });
    console.log(`Server running at http://${host}:${port}`);
    return fastify;
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  startServer();
}

export { fastify };
