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
        nicknames: JSON.parse(c.nicknames_json || '[]'),
        feed_keywords: JSON.parse(c.feed_keywords_json || '[]'),
        example_messages: JSON.parse(c.example_messages_json || '[]'),
        tags: JSON.parse(c.tags_json || '[]'),
        owner: JSON.parse(c.owner_json || '{"name":"User","pronoun":"they"}'),
        songs: JSON.parse(c.songs_json || '[]'),
        song_aliases: JSON.parse(c.song_aliases_json || '{}'),
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
      nicknames: JSON.parse(char.nicknames_json || '[]'),
      feed_keywords: JSON.parse(char.feed_keywords_json || '[]'),
      example_messages: JSON.parse(char.example_messages_json || '[]'),
      tags: JSON.parse(char.tags_json || '[]'),
      owner: JSON.parse(char.owner_json || '{"name":"User","pronoun":"they"}'),
      songs: JSON.parse(char.songs_json || '[]'),
      song_aliases: JSON.parse(char.song_aliases_json || '{}'),
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

  // PATCH rename costume without touching disk
  app.patch('/api/characters/:charId/costumes/:costumeId', async (req, reply) => {
    const { charId, costumeId } = req.params as { charId: string; costumeId: string };
    const { name } = req.body as { name: string };
    const newName = (name || '').trim();
    if (!newName) {
      return reply.status(400).send({ error: 'Costume name cannot be empty' });
    }
    dbManager.renameCostume(charId, costumeId, newName);
    wsHub.broadcast({
      type: 'costume_renamed',
      character_id: charId,
      costume_id: costumeId,
      name: newName
    });
    return reply.send({ ok: true, characterId: charId, costumeId, name: newName });
  });

  // PATCH rename character display name without touching disk
  app.patch('/api/characters/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name, display_name } = req.body as { name?: string; display_name?: string };
    const newName = (display_name || name || '').trim();
    if (!newName) {
      return reply.status(400).send({ error: 'Character name cannot be empty' });
    }
    dbManager.updateCharacterName(id, newName);
    wsHub.broadcast({
      type: 'character_renamed',
      character_id: id,
      display_name: newName
    });
    return reply.send({ ok: true, id, display_name: newName });
  });
}
