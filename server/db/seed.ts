import fs from 'node:fs';
import path from 'node:path';
import { dbManager } from './client';

export function scanAndSeedCharacters(): void {
  const charactersDir = path.resolve(process.cwd(), 'Characters');
  if (!fs.existsSync(charactersDir)) {
    console.log('[seed] Characters directory not found at:', charactersDir);
    return;
  }

  const entries = fs.readdirSync(charactersDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const charDir = path.join(charactersDir, entry.name);
    const jsonPath = path.join(charDir, 'character.json');
    if (!fs.existsSync(jsonPath)) continue;

    try {
      const raw = fs.readFileSync(jsonPath, 'utf-8');
      const data = JSON.parse(raw);

      const id = data.id || entry.name;
      const name = data.name || entry.name;
      const defaultCostume = data.defaultCostume || (data.costumes && data.costumes[0]?.id) || 'default';

      // Scan available expressions from first costume
      const expressionsList: string[] = [];
      if (Array.isArray(data.costumes)) {
        for (const c of data.costumes) {
          const modelRel = c.model || '';
          const costumeFolder = path.dirname(path.join(charDir, modelRel));
          const expDir = path.join(costumeFolder, 'expressions');
          if (fs.existsSync(expDir)) {
            const expFiles = fs.readdirSync(expDir).filter(f => f.endsWith('.exp3.json'));
            for (const ef of expFiles) {
              const expName = ef.replace('.exp3.json', '');
              if (!expressionsList.includes(expName)) expressionsList.push(expName);
            }
          }
        }
      }

      // Scan available motions
      const motionsList: string[] = [];
      const motionsDir = path.join(charDir, 'motions');
      if (fs.existsSync(motionsDir)) {
        const mFiles = fs.readdirSync(motionsDir).filter(f => f.endsWith('.motion3.json'));
        for (const mf of mFiles) {
          motionsList.push(mf.replace('.motion3.json', ''));
        }
      }

      // Check for voice reference audio (e.g. voice/greet.wav or ref audio for OmniVoice)
      let voiceRef = '';
      const voiceDir = path.join(charDir, data.voice || 'voice');
      if (fs.existsSync(voiceDir)) {
        const wavs = fs.readdirSync(voiceDir).filter(f => f.endsWith('.wav'));
        if (wavs.length > 0) {
          voiceRef = path.join(data.voice || 'voice', wavs[0]).replace(/\\/g, '/');
        }
      }

      // Upsert Character
      const existing = dbManager.getCharacter(id);
      dbManager.upsertCharacter({
        id,
        name,
        display_name: existing?.display_name || name,
        description: data.description || existing?.description || `${name} companion`,
        system_prompt: existing?.system_prompt || data.system_prompt || `You are ${name}, a helpful and expressive anime companion. Always express your feelings honestly, stay in character, and react warmly to your companion.`,
        model_dir: entry.name,
        default_costume_id: defaultCostume,
        active_costume_id: existing?.active_costume_id || defaultCostume,
        expressions_json: JSON.stringify(expressionsList),
        motions_json: JSON.stringify(motionsList),
        tts_voice_ref: voiceRef,
        tts_engine: existing?.tts_engine || 'omnivoice',
        tts_voice_instruct: existing?.tts_voice_instruct || (id.toLowerCase().includes('towa') ? 'female, low pitch, devilish charm' : 'female, energetic, high pitch'),
        nicknames_json: JSON.stringify(data.nickname || data.nicknames || []),
        feed_keywords_json: JSON.stringify(data.feed_keywords || []),
        personality: data.personality || existing?.personality || '',
        scenario: data.scenario || existing?.scenario || '',
        first_message: data.first_message || existing?.first_message || '',
        example_messages_json: JSON.stringify(data.example_messages || []),
        tags_json: JSON.stringify(data.tags || []),
        owner_json: JSON.stringify(data.owner || { name: 'User', pronoun: 'they' }),
        timezone: data.timezone || existing?.timezone || '',
        tz_label: data.tz_label || existing?.tz_label || '',
        language: data.language || existing?.language || 'en',
        country: data.country || existing?.country || '',
        songs_json: JSON.stringify(data.songs || []),
        song_aliases_json: JSON.stringify(data.song_aliases || {})
      });

      // Upsert Costumes (preserving user-renamed costume names)
      if (Array.isArray(data.costumes)) {
        for (const c of data.costumes) {
          const costumeId = `${id}::${c.id}`;
          const existingCostume = dbManager.getCostume(costumeId);
          dbManager.upsertCostume({
            id: costumeId,
            character_id: id,
            costume_slug: c.id,
            name: existingCostume?.name || c.name || c.id,
            model_path: c.model,
            tags_json: JSON.stringify(c.tags || [c.name || c.id]),
            created_at: existingCostume?.created_at || Date.now()
          });
        }
      }

      console.log(`[seed] Synced character: ${name} (${id}) with ${data.costumes?.length || 0} costume(s)`);
    } catch (e) {
      console.error(`[seed] Failed to parse character.json for ${entry.name}:`, e);
    }
  }
}
