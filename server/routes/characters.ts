import { FastifyInstance } from 'fastify';
import { dbManager } from '../db/client';
import { wsHub } from '../ws/ws-hub';

export async function registerCharacterRoutes(app: FastifyInstance): Promise<void> {
  // GET all characters with costumes
  app.get('/api/characters', async (_req, reply) => {
    const chars = dbManager.getAllCharacters();
    const result = chars.map(c => {
      const costumes = dbManager.getCostumesForCharacter(c.id);
      return {
        ...c,
        expressions: JSON.parse(c.expressions_json || '[]'),
        motions: JSON.parse(c.motions_json || '[]'),
        costumes: costumes.map(cs => ({
          ...cs,
          tags: JSON.parse(cs.tags_json || '[]')
        }))
      };
    });
    return reply.send(result);
  });

  // GET single character
  app.get('/api/characters/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const char = dbManager.getCharacter(id);
    if (!char) return reply.status(404).send({ error: 'Character not found' });

    const costumes = dbManager.getCostumesForCharacter(char.id);
    return reply.send({
      ...char,
      expressions: JSON.parse(char.expressions_json || '[]'),
      motions: JSON.parse(char.motions_json || '[]'),
      costumes: costumes.map(cs => ({
        ...cs,
        tags: JSON.parse(cs.tags_json || '[]')
      }))
    });
  });

  // POST switch costume
  app.post('/api/characters/:id/costume', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { costumeId } = req.body as { costumeId: string };

    const char = dbManager.getCharacter(id);
    if (!char) return reply.status(404).send({ error: 'Character not found' });

    dbManager.setActiveCostume(id, costumeId);

    // Notify connected clients via WebSocket
    wsHub.broadcast({
      type: 'change_costume',
      character_id: id,
      costume_id: costumeId
    });

    return reply.send({ ok: true, characterId: id, activeCostumeId: costumeId });
  });

  // PUT update character settings
  app.put('/api/characters/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const updates = req.body as any;

    const char = dbManager.getCharacter(id);
    if (!char) return reply.status(404).send({ error: 'Character not found' });

    dbManager.upsertCharacter({
      ...char,
      ...updates,
      id
    });

    const updated = dbManager.getCharacter(id);
    return reply.send({ ok: true, character: updated });
  });
}
