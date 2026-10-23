import fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import dotenv from 'dotenv';
import { scanAndSeedCharacters } from './db/seed';
import { wsHub } from './ws/ws-hub';
import { registerAssetRoutes } from './routes/assets';
import { registerCharacterRoutes } from './routes/characters';
import { registerSettingsRoutes } from './routes/settings';
import { registerChatRoutes } from './routes/chat';
import { telegramBotBridge } from './bridges/telegram-bot';
import { discordBotBridge } from './bridges/discord-bot';

dotenv.config();

const app = fastify({
  logger: true
});

async function main() {
  // CORS
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  });

  // WebSocket
  await app.register(websocket);

  app.register(async (fastify) => {
    fastify.get('/ws', { websocket: true }, (socket, _req) => {
      wsHub.addClient(socket);
    });
  });

  // Health check
  app.get('/api/health', async () => ({
    status: 'ok',
    time: Date.now(),
    clients: wsHub.clientCount
  }));

  // Routes
  await registerAssetRoutes(app);
  await registerCharacterRoutes(app);
  await registerSettingsRoutes(app);
  await registerChatRoutes(app);

  // Scan and seed ./Characters folder into SQLite
  console.log('[server] Scanning and syncing characters from ./Characters...');
  scanAndSeedCharacters();

  // Start optional external bot bridges
  void telegramBotBridge.start();
  void discordBotBridge.start();

  const PORT = Number(process.env.PORT || 8800);
  const HOST = process.env.HOST || '0.0.0.0';

  await app.listen({ port: PORT, host: HOST });
  console.log(`\n🚀 Companion Server running on http://${HOST}:${PORT}`);
  console.log(`📡 WebSocket endpoint at ws://${HOST}:${PORT}/ws\n`);
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
