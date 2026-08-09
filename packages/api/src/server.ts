import cors from '@fastify/cors';
import Fastify from 'fastify';
import { registerListingRoutes } from './routes/listings.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

registerListingRoutes(app);

app.get('/health', () => ({ ok: true }));

// zámerne API_PORT, nie PORT — PORT si často nastavuje dev harness pre frontend
const port = Number(process.env.API_PORT ?? 3001);

try {
  await app.listen({ port, host: '127.0.0.1' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
