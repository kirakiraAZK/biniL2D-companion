import { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';

export async function registerAssetRoutes(app: FastifyInstance): Promise<void> {
  const charactersDir = path.resolve(process.cwd(), 'Characters');
  const audioDir = path.resolve(process.cwd(), 'audio');

  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
  }

  // Register characters asset serving under /models/
  await app.register(fastifyStatic, {
    root: charactersDir,
    prefix: '/models/',
    decorateReply: false
  });

  // Also register under /api/assets/characters/
  await app.register(fastifyStatic, {
    root: charactersDir,
    prefix: '/api/assets/characters/',
    decorateReply: false
  });

  // Register generated audio serving under /audio/
  await app.register(fastifyStatic, {
    root: audioDir,
    prefix: '/audio/',
    decorateReply: false
  });

  // Dynamic models index.json endpoint (backward compatibility with root registry.ts)
  app.get('/models/index.json', async (_req, reply) => {
    try {
      const entries = fs.readdirSync(charactersDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
      return reply.send(dirs);
    } catch {
      return reply.send([]);
    }
  });
}
