import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const DB_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'companion.sqlite');

export interface CharacterRow {
  id: string;
  name: string;
  display_name: string;
  description: string;
  system_prompt: string;
  model_dir: string;
  default_costume_id: string;
  active_costume_id: string;
  expressions_json: string;
  motions_json: string;
  ai_provider: string;
  ai_model: string;
  custom_base_url: string;
  temperature: number;
  tts_enabled: number;
  tts_engine: string;
  tts_voice: string;
  tts_voice_ref: string;
  tts_voice_instruct: string;
  tts_speed: number;
  created_at: number;
  updated_at: number;
}

export interface CostumeRow {
  id: string;
  character_id: string;
  costume_slug: string;
  name: string;
  model_path: string;
  tags_json: string;
  created_at: number;
}

export interface ConversationRow {
  id: string;
  character_id: string;
  participant_ids_json: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  character_id?: string | null;
  character_name?: string | null;
  content: string;
  raw_content: string;
  emotion?: string | null;
  expression?: string | null;
  motion?: string | null;
  costume?: string | null;
  audio_url?: string | null;
  created_at: number;
}

export interface SettingRow {
  key: string;
  value: string;
  updated_at: number;
}

export interface MemoryRow {
  id: string;
  character_id: string;
  category: string;
  fact: string;
  importance: number;
  created_at: number;
}

class DatabaseManager {
  private db: DatabaseSync;

  constructor() {
    this.db = new DatabaseSync(DB_PATH);
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        system_prompt TEXT NOT NULL,
        model_dir TEXT NOT NULL,
        default_costume_id TEXT NOT NULL,
        active_costume_id TEXT NOT NULL,
        expressions_json TEXT NOT NULL DEFAULT '[]',
        motions_json TEXT NOT NULL DEFAULT '[]',
        ai_provider TEXT NOT NULL DEFAULT 'openai',
        ai_model TEXT NOT NULL DEFAULT '',
        custom_base_url TEXT NOT NULL DEFAULT '',
        temperature REAL NOT NULL DEFAULT 0.75,
        tts_enabled INTEGER NOT NULL DEFAULT 1,
        tts_engine TEXT NOT NULL DEFAULT 'omnivoice',
        tts_voice TEXT NOT NULL DEFAULT 'ja-JP-NanamiNeural',
        tts_voice_ref TEXT NOT NULL DEFAULT '',
        tts_voice_instruct TEXT NOT NULL DEFAULT 'female, cheerful pitch',
        tts_speed REAL NOT NULL DEFAULT 1.0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS costumes (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL,
        costume_slug TEXT NOT NULL,
        name TEXT NOT NULL,
        model_path TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL,
        participant_ids_json TEXT NOT NULL DEFAULT '[]',
        title TEXT NOT NULL DEFAULT 'New Conversation',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        character_id TEXT,
        character_name TEXT,
        content TEXT NOT NULL,
        raw_content TEXT NOT NULL DEFAULT '',
        emotion TEXT,
        expression TEXT,
        motion TEXT,
        costume TEXT,
        audio_url TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        fact TEXT NOT NULL,
        importance INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
      );
    `);
  }

  // --- Characters ---
  getAllCharacters(): CharacterRow[] {
    return this.db.prepare('SELECT * FROM characters ORDER BY created_at ASC').all() as unknown as CharacterRow[];
  }

  getCharacter(id: string): CharacterRow | undefined {
    return this.db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as unknown as CharacterRow | undefined;
  }

  upsertCharacter(char: Partial<CharacterRow> & { id: string; name: string }): void {
    const existing = this.getCharacter(char.id);
    const now = Date.now();
    if (existing) {
      const updates = { ...existing, ...char, updated_at: now };
      this.db.prepare(`
        UPDATE characters SET
          name = ?, display_name = ?, description = ?, system_prompt = ?, model_dir = ?,
          default_costume_id = ?, active_costume_id = ?, expressions_json = ?, motions_json = ?,
          ai_provider = ?, ai_model = ?, custom_base_url = ?, temperature = ?,
          tts_enabled = ?, tts_engine = ?, tts_voice = ?, tts_voice_ref = ?, tts_voice_instruct = ?, tts_speed = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        updates.name, updates.display_name, updates.description, updates.system_prompt, updates.model_dir,
        updates.default_costume_id, updates.active_costume_id, updates.expressions_json, updates.motions_json,
        updates.ai_provider, updates.ai_model, updates.custom_base_url, updates.temperature,
        updates.tts_enabled, updates.tts_engine, updates.tts_voice, updates.tts_voice_ref, updates.tts_voice_instruct, updates.tts_speed,
        updates.updated_at, updates.id
      );
    } else {
      this.db.prepare(`
        INSERT INTO characters (
          id, name, display_name, description, system_prompt, model_dir,
          default_costume_id, active_costume_id, expressions_json, motions_json,
          ai_provider, ai_model, custom_base_url, temperature,
          tts_enabled, tts_engine, tts_voice, tts_voice_ref, tts_voice_instruct, tts_speed,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        char.id, char.name, char.display_name ?? char.name, char.description ?? '', char.system_prompt ?? '', char.model_dir ?? '',
        char.default_costume_id ?? '', char.active_costume_id ?? char.default_costume_id ?? '',
        char.expressions_json ?? '[]', char.motions_json ?? '[]',
        char.ai_provider ?? 'openai', char.ai_model ?? '', char.custom_base_url ?? '', char.temperature ?? 0.75,
        char.tts_enabled ?? 1, char.tts_engine ?? 'omnivoice', char.tts_voice ?? 'ja-JP-NanamiNeural',
        char.tts_voice_ref ?? '', char.tts_voice_instruct ?? 'female, cheerful pitch', char.tts_speed ?? 1.0,
        char.created_at ?? now, now
      );
    }
  }

  setActiveCostume(characterId: string, costumeId: string): void {
    this.db.prepare('UPDATE characters SET active_costume_id = ?, updated_at = ? WHERE id = ?')
      .run(costumeId, Date.now(), characterId);
  }

  // --- Costumes ---
  getCostumesForCharacter(characterId: string): CostumeRow[] {
    return this.db.prepare('SELECT * FROM costumes WHERE character_id = ? ORDER BY created_at ASC')
      .all(characterId) as unknown as CostumeRow[];
  }

  getCostume(id: string): CostumeRow | undefined {
    return this.db.prepare('SELECT * FROM costumes WHERE id = ?').get(id) as unknown as CostumeRow | undefined;
  }

  upsertCostume(costume: CostumeRow): void {
    const existing = this.getCostume(costume.id);
    if (existing) {
      this.db.prepare(`
        UPDATE costumes SET
          costume_slug = ?, name = ?, model_path = ?, tags_json = ?
        WHERE id = ?
      `).run(costume.costume_slug, costume.name, costume.model_path, costume.tags_json, costume.id);
    } else {
      this.db.prepare(`
        INSERT INTO costumes (id, character_id, costume_slug, name, model_path, tags_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(costume.id, costume.character_id, costume.costume_slug, costume.name, costume.model_path, costume.tags_json, costume.created_at);
    }
  }

  // --- Conversations ---
  getOrCreateConversation(characterId: string): ConversationRow {
    const existing = this.db.prepare(
      'SELECT * FROM conversations WHERE character_id = ? ORDER BY updated_at DESC LIMIT 1'
    ).get(characterId) as unknown as ConversationRow | undefined;

    if (existing) return existing;

    const id = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO conversations (id, character_id, participant_ids_json, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, characterId, JSON.stringify([characterId]), 'Main Chat', now, now);

    return {
      id,
      character_id: characterId,
      participant_ids_json: JSON.stringify([characterId]),
      title: 'Main Chat',
      created_at: now,
      updated_at: now
    };
  }

  getMessages(conversationId: string, limit = 50): MessageRow[] {
    return this.db.prepare(`
      SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?
    `).all(conversationId, limit) as unknown as MessageRow[];
  }

  addMessage(msg: Omit<MessageRow, 'id' | 'created_at'>): MessageRow {
    const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO messages (
        id, conversation_id, role, character_id, character_name, content, raw_content,
        emotion, expression, motion, costume, audio_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, msg.conversation_id, msg.role, msg.character_id ?? null, msg.character_name ?? null,
      msg.content, msg.raw_content ?? msg.content, msg.emotion ?? null, msg.expression ?? null,
      msg.motion ?? null, msg.costume ?? null, msg.audio_url ?? null, now
    );

    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, msg.conversation_id);

    return {
      ...msg,
      id,
      created_at: now
    };
  }

  clearMessages(conversationId: string): void {
    this.db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId);
  }

  // --- Settings ---
  getSettings(): Record<string, string> {
    const rows = this.db.prepare('SELECT * FROM settings').all() as unknown as SettingRow[];
    const res: Record<string, string> = {};
    for (const r of rows) res[r.key] = r.value;
    return res;
  }

  getSetting(key: string, defaultValue = ''): string {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as unknown as { value: string } | undefined;
    return row ? row.value : defaultValue;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value, Date.now());
  }

  // --- Memories ---
  getMemories(characterId: string, limit = 20): MemoryRow[] {
    return this.db.prepare(`
      SELECT * FROM memories WHERE character_id = ? ORDER BY importance DESC, created_at DESC LIMIT ?
    `).all(characterId, limit) as unknown as MemoryRow[];
  }

  addMemory(characterId: string, fact: string, category = 'general', importance = 1): void {
    const id = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.db.prepare(`
      INSERT INTO memories (id, character_id, category, fact, importance, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, characterId, category, fact, importance, Date.now());
  }
}

export const dbManager = new DatabaseManager();
