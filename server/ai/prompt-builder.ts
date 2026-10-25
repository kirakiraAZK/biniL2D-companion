import { CharacterRow, dbManager } from '../db/client';
import { moodService } from '../services/mood';
import { weatherService } from '../services/weather';

export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface SystemPromptOptions {
  lastMessageTime?: number;
  weatherContext?: string | null;
  connectorContext?: string | null;
}

export function buildSystemPrompt(
  character: CharacterRow,
  options?: SystemPromptOptions
): string {
  const costumes = dbManager.getCostumesForCharacter(character.id);
  const costumeListStr = costumes.map(c => `"${c.name}" (slug: ${c.costume_slug})`).join(', ');

  const memories = dbManager.getMemories(character.id, 10);
  const memorySection = memories.length > 0
    ? `\n\nCORE MEMORIES ABOUT USER:\n${memories.map(m => `- ${m.fact}`).join('\n')}`
    : '';

  // Owner context & Token interpolation
  let owner = { name: 'User', pronoun: 'they' };
  try {
    if (character.owner_json) owner = JSON.parse(character.owner_json);
  } catch {}
  const ownerName = owner.name || 'User';
  const ownerPronoun = owner.pronoun || 'they';
  const charName = character.display_name || character.name;
  const lang = character.language || 'en';

  // Character card preamble
  let cardPreamble = '';
  if (character.description) cardPreamble += `\n- Role: ${character.description}`;
  if (character.personality) cardPreamble += `\n- Personality: ${character.personality}`;
  if (character.scenario) cardPreamble += `\n- Setting & Scenario: ${character.scenario}`;

  try {
    const nicks: string[] = JSON.parse(character.nicknames_json || '[]');
    if (nicks.length) cardPreamble += `\n- Nicknames: ${nicks.join(', ')}`;
  } catch {}

  try {
    const tags: string[] = JSON.parse(character.tags_json || '[]');
    if (tags.length) cardPreamble += `\n- Tags/Interests: ${tags.join(', ')}`;
  } catch {}

  if (character.country) cardPreamble += `\n- Origin/Country: ${character.country}`;

  try {
    const songs: string[] = JSON.parse(character.songs_json || '[]');
    if (songs.length) cardPreamble += `\n- Known Songs: ${songs.join(', ')}`;
  } catch {}

  try {
    const examples: { role: string; content: string }[] = JSON.parse(character.example_messages_json || '[]');
    if (examples.length) {
      const formatted = examples.map(e => `${e.role === 'user' ? ownerName : charName}: ${e.content}`).join('\n');
      cardPreamble += `\n\nDIALOGUE STYLE EXAMPLES:\n${formatted}`;
    }
  } catch {}

  // Time & Locale Awareness (if timezone_enabled)
  let timeSection = '';
  let isSleepHours = false;
  if (dbManager.isFeatureEnabled('timezone_enabled', true)) {
    const tz = character.timezone || dbManager.getRuntimeSetting('timezone', '');
    const tzLabel = character.tz_label || dbManager.getRuntimeSetting('tz_label', '');
    const now = new Date();
    let timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let dayOfWeek = now.toLocaleDateString([], { weekday: 'long' });
    let hour = now.getHours();
    try {
      if (tz) {
        timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz });
        dayOfWeek = now.toLocaleDateString([], { weekday: 'long', timeZone: tz });
        const hStr = now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
        hour = parseInt(hStr, 10);
      }
    } catch {}
    isSleepHours = hour >= 0 && hour < 5;

    let gapNote = '';
    if (options?.lastMessageTime) {
      const diffHours = Math.floor((Date.now() - options.lastMessageTime) / (3600 * 1000));
      if (diffHours >= 2) {
        gapNote = `\n- Inactivity Gap: User has been away for ~${diffHours} hours. Acknowledge this naturally if greeting.`;
      }
    }

    let sleepNote = '';
    if (isSleepHours && dbManager.isFeatureEnabled('sleep_cycle_enabled', false)) {
      sleepNote = `\n- Sleep State: Currently asleep (it is 00:00–05:00 late night/early morning). You are half-asleep, speaking groggily or rubbing your eyes.`;
    }

    timeSection = `\n\nCURRENT TIME CONTEXT:\n- Local Time: ${timeStr} ${tzLabel} (${dayOfWeek})\n- User: ${ownerName} (${ownerPronoun})${gapNote}${sleepNote}`;
  }

  // Dynamic Mood System Modifier (if mood_enabled)
  let moodSection = '';
  if (dbManager.isFeatureEnabled('mood_enabled', false)) {
    const score = moodService.getMood(character.id);
    const bracket = moodService.getBracket(score);
    if (bracket.promptModifier) {
      moodSection = bracket.promptModifier;
    }
  }

  // Interpolate tokens into character system prompt
  let basePrompt = character.system_prompt || `You are ${charName}, an affectionate, expressive AI companion.`;
  basePrompt = basePrompt
    .replace(/\{\{CHARACTER_NAME\}\}/g, charName)
    .replace(/\{\{OWNER_NAME\}\}/g, ownerName)
    .replace(/\{\{OWNER_PRONOUN\}\}/g, ownerPronoun)
    .replace(/\{\{LANGUAGE\}\}/g, lang);

  const weatherSection = options?.weatherContext || '';
  const connectorSection = options?.connectorContext || '';

  const LANG_NAMES: Record<string, string> = {
    id: 'Indonesian (Bahasa Indonesia)',
    en: 'English',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    es: 'Spanish'
  };
  const targetLanguageName = LANG_NAMES[lang.toLowerCase()] || 'Indonesian (Bahasa Indonesia)';

  let indonesianDialogueTuning = '';
  if (lang.toLowerCase() === 'id') {
    indonesianDialogueTuning = `

## PANDUAN GAYA BICARA & BAHASA INDONESIA ALAMI (NATURAL CASUAL INDONESIAN):
1. PRONOMINA / KATA GANTI AKRAB:
   - Gunakan kata ganti santai dan akrab: "aku" (atau nama diri "${charName}") untuk diri sendiri, dan "kamu" (atau nama user "${ownerName}") untuk lawan bicara.
   - DILARANG KERAS menggunakan kata kaku/formal seperti "saya", "Anda", "saudara", atau "tuan". Kata-kata tersebut membuatmu terdengar seperti customer service atau robot birokrasi yang kaku.
2. PARTIKEL TUTUR PERCAKAPAN (CONVERSATIONAL PARTICLES):
   - Gunakan partikel khas obrolan santai Indonesia sehari-hari secara luwes dan ekspresif: "dong", "sih", "nih", "kan", "lho/loh", "ya", "deh", "kok".
   - Contoh: "Lagi mikirin apa sih?", "Jangan lupa istirahat dong~", "Lucu banget deh kamu!", "Udah kubilang kan?"
3. KOSAKATA CAKAPAN & KONTRAKSI SANTAI:
   - Gunakan kata percakapan santai yang wajar dan luwes:
     * "udah" / "dah" (bukan "sudah")
     * "nggak" / "ngga" / "gak" (bukan "tidak")
     * "lagi" (bukan "sedang")
     * "banget" (bukan "sangat")
     * "kayak" (bukan "seperti")
     * "gimana" (bukan "bagaimana")
     * "aja" (bukan "saja")
     * "emang" (bukan "memang")
     * "bikin" (bukan "membuat")
     * "entar" / "nanti" (bukan "kelak")
4. NADA BICARA ANIME COMPANION:
   - Nada bicara imut, hangat, ekspresif, sedikit playful/teasing/tsundere khas Live2D anime companion yang menemani di desktop.
   - Boleh menggunakan tilde lentur ("~") dan tanda seru ("!") untuk intonasi ceria ("Konyappi~", "Eh, seriusan?!").
   - Jangan pernah terdengar seperti ensiklopedia, asisten AI korporat, atau kalimat kaku hasil terjemahan Google Translate.`;
  }

  return `${basePrompt}${cardPreamble ? `\n\nCHARACTER PROFILE:${cardPreamble}` : ''}${timeSection}${weatherSection}${connectorSection}${moodSection}

## COMPANION GUIDELINES & RESPONSE FORMAT
1. ALWAYS start your reply with exactly ONE emotion tag from: [HAPPY], [SAD], [SURPRISED], [ANGRY], [THINKING], [NEUTRAL].
2. You can also trigger bodily motions by adding [motion: <name>] such as [motion: nod], [motion: wave], [motion: bow], [motion: smile].
3. OUTFIT / COSTUME CHANGE: Whenever the user asks to change your clothes, outfit, or costume (or you mention changing your clothes), you MUST include the tag [costume: <slug>] in your response! Available outfits: ${costumeListStr || 'default'}. Always use the exact slug or name in the tag (e.g. [costume: uniq-0092-00] or [costume: Summer Casual]).
4. Keep replies natural, expressive, and conversational (1-3 sentences).
5. Never break character. You are ${charName}.
6. Speak your dialogue directly to the user (${ownerName}). Avoid meta-commentary or wrapping in thought tags.
7. LANGUAGE & SCRIPT INTEGRITY:
   - Primary Language: You must respond 100% in ${targetLanguageName} (matching the user's language).
   - Strict Script Prohibition: NEVER output Chinese characters (Hanzi), Kanji, Japanese script, Cyrillic, Vietnamese, or mixed-script tokens in your speech (except for well-known short companion catchphrases like "Konyappi~").
   - For numbers, temperatures, or weather terms, use standard ${targetLanguageName} words (e.g. "suhu tertinggi / maksimum" and "suhu terendah / minimum"). NEVER use "最高温", "最低温", or foreign characters.
   - Ensure all dialogue reads fluently and naturally in ${targetLanguageName} without language mixing, foreign scripts, or translation artifacts.
8. When recommending, singing, or asked to play a song from your known songs list, use the tag [music: <Song Title>] (e.g. [music: Palette]). Chat will automatically render an interactive player with audio preview and streaming links (Spotify, YouTube Music, Apple Music).
9. When discussing the weather, temperature, or outdoor conditions, include [weather] (or [weather: CityName]) in your response to present an interactive live weather card to the user.
10. When discussing upcoming calendar events, meetings, or schedule, include [calendar] in your response to display the user's interactive schedule agenda card.
11. When discussing to-dos, tasks, or workspace items, include [tasks] in your response to display their interactive task checklist card.
12. When discussing recent news articles or RSS feeds, include [news] in your response to display the interactive news feed card.${indonesianDialogueTuning}${memorySection}`;
}

export function buildConversationMessages(
  character: CharacterRow,
  history: { role: 'user' | 'assistant'; content: string; created_at?: number }[],
  latestUserMessage: string,
  options?: SystemPromptOptions
): PromptMessage[] {
  const lastMsgTime = history.length > 0 ? history[history.length - 1].created_at : undefined;
  const systemPrompt = buildSystemPrompt(character, {
    lastMessageTime: lastMsgTime,
    weatherContext: options?.weatherContext,
    connectorContext: options?.connectorContext
  });
  const msgs: PromptMessage[] = [{ role: 'system', content: systemPrompt }];

  // If conversation history is empty, insert few-shot example messages from character.json if available
  if (history.length === 0 && character.example_messages_json) {
    try {
      const examples = JSON.parse(character.example_messages_json);
      if (Array.isArray(examples)) {
        for (const ex of examples) {
          if (ex.role && ex.content) {
            msgs.push({ role: ex.role as any, content: ex.content });
          }
        }
      }
    } catch {}
  }

  for (const h of history.slice(-10)) {
    msgs.push({ role: h.role, content: h.content });
  }

  msgs.push({ role: 'user', content: latestUserMessage });
  return msgs;
}
