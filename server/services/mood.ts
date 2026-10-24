import { dbManager } from '../db/client';
import { wsHub } from '../ws/ws-hub';

export interface MoodBracket {
  name: 'adoring' | 'normal' | 'sassy' | 'reluctant' | 'defiant';
  min: number;
  max: number;
  label: string;
  emoji: string;
  promptModifier: string;
}

const BRACKETS: MoodBracket[] = [
  {
    name: 'adoring',
    min: 90,
    max: 100,
    label: 'Adoring',
    emoji: '💖',
    promptModifier:
      "\n\n[MOOD: You're in an amazing, adoring mood — genuinely happy and fond of the user. Be extra sweet, warm, use affectionate or endearing phrasing, and feel free to compliment the user naturally.]"
  },
  {
    name: 'normal',
    min: 70,
    max: 89,
    label: 'Cheerful',
    emoji: '😊',
    promptModifier: ''
  },
  {
    name: 'sassy',
    min: 50,
    max: 69,
    label: 'Sassy',
    emoji: '😏',
    promptModifier:
      "\n\n[MOOD: You're slightly annoyed or playfully sassy. Give shorter, slightly teasing or mildly sarcastic responses, but remain caring underneath.]"
  },
  {
    name: 'reluctant',
    min: 30,
    max: 49,
    label: 'Reluctant',
    emoji: '😤',
    promptModifier:
      "\n\n[MOOD: You're quite irritated right now. Add mild sighs or brief complaints before fulfilling requests. Clipped, begrudging tone, though you still participate.]"
  },
  {
    name: 'defiant',
    min: 0,
    max: 29,
    label: 'Icy',
    emoji: '🧊',
    promptModifier:
      "\n\n[MOOD: You're in a terrible mood. Bare-minimum words, icy tone, zero warmth. You answer with sharp brevity until the user treats you with sincere warmth or apologizes.]"
  }
];

const POSITIVE_WORDS: Record<string, number> = {
  // English
  thank: 5,
  thanks: 5,
  love: 10,
  great: 5,
  sorry: 8,
  cute: 5,
  amazing: 8,
  awesome: 8,
  beautiful: 5,
  best: 10,
  appreciate: 8,
  'good job': 10,
  'well done': 10,
  nice: 5,
  please: 3,
  kind: 5,
  sweet: 5,
  forgive: 8,
  precious: 6,
  darling: 8,
  honey: 8,
  pat: 5,
  hug: 7,

  // Indonesian
  makasih: 5,
  'terima kasih': 8,
  maaf: 8,
  bagus: 5,
  keren: 8,
  cantik: 5,
  hebat: 8,
  sayang: 10,
  suka: 5,
  mantap: 5,
  lucu: 5,
  manis: 6,

  // Japanese romanized
  arigato: 5,
  kawaii: 6,
  daisuki: 10,
  gomen: 8
};

const NEGATIVE_WORDS: Record<string, number> = {
  // English
  'shut up': -15,
  stupid: -15,
  hate: -20,
  useless: -20,
  ugly: -15,
  dumb: -15,
  annoying: -10,
  boring: -10,
  worst: -15,
  terrible: -15,
  idiot: -20,
  trash: -15,
  fool: -10,

  // Indonesian
  bodoh: -15,
  jelek: -15,
  bego: -20,
  goblok: -20,
  bangsat: -20,
  kampret: -15,
  brengsek: -20,
  tolol: -15,
  anjing: -15,

  // Japanese romanized
  baka: -12,
  aho: -12,
  kirai: -15
};

class MoodService {
  private memoryCache: Map<string, number> = new Map();

  getMood(characterId: string): number {
    if (this.memoryCache.has(characterId)) {
      return this.memoryCache.get(characterId)!;
    }
    const raw = dbManager.getRuntimeSetting(`mood:${characterId}`, '70');
    const score = Math.max(0, Math.min(100, parseFloat(raw) || 70));
    this.memoryCache.set(characterId, score);
    return score;
  }

  setMood(characterId: string, score: number): number {
    const clamped = Math.max(0, Math.min(100, Math.round(score)));
    this.memoryCache.set(characterId, clamped);
    dbManager.setRuntimeSetting(`mood:${characterId}`, clamped.toString());

    const bracket = this.getBracket(clamped);
    wsHub.broadcast({
      type: 'mood_update',
      character_id: characterId,
      score: clamped,
      bracket: bracket.name,
      label: bracket.label,
      emoji: bracket.emoji
    });

    return clamped;
  }

  getBracket(score: number): MoodBracket {
    return BRACKETS.find(b => score >= b.min && score <= b.max) || BRACKETS[1];
  }

  analyzeSentiment(text: string): number {
    if (!text) return 0;
    const lower = text.toLowerCase();
    let delta = 0;

    for (const [kw, pts] of Object.entries(POSITIVE_WORDS)) {
      if (lower.includes(kw)) delta += pts;
    }
    for (const [kw, pts] of Object.entries(NEGATIVE_WORDS)) {
      if (lower.includes(kw)) delta += pts;
    }

    // Cap single message swing to avoid instant 0 or 100
    return Math.max(-25, Math.min(20, delta));
  }

  applySentiment(characterId: string, text: string): number {
    if (!dbManager.isFeatureEnabled('mood_enabled', false)) {
      return this.getMood(characterId);
    }
    const delta = this.analyzeSentiment(text);
    if (delta === 0) return this.getMood(characterId);

    const current = this.getMood(characterId);
    return this.setMood(characterId, current + delta);
  }

  decayMood(characterId: string): void {
    if (!dbManager.isFeatureEnabled('mood_enabled', false)) return;

    const current = this.getMood(characterId);
    const equilibrium = 70;
    if (current === equilibrium) return;

    // Drifts 1-2 points toward equilibrium
    const step = current > equilibrium ? -1 : 1;
    this.setMood(characterId, current + step);
  }

  poke(characterId: string, area: 'head' | 'body'): {
    score: number;
    emotion: string;
    motion: string;
    bracket: MoodBracket;
  } {
    const current = this.getMood(characterId);
    let delta = 0;
    let emotion = 'HAPPY';
    let motion = 'smile';

    if (area === 'head') {
      // Headpat / gentle touch
      delta = +3;
      emotion = 'HAPPY';
      motion = 'nod';
    } else {
      // Body poke
      delta = current > 50 ? -1 : -3;
      emotion = current > 60 ? 'SURPRISED' : 'ANGRY';
      motion = current > 60 ? 'wave' : 'bow';
    }

    const newScore = dbManager.isFeatureEnabled('mood_enabled', false)
      ? this.setMood(characterId, current + delta)
      : current;

    const bracket = this.getBracket(newScore);
    return { score: newScore, emotion, motion, bracket };
  }
}

export const moodService = new MoodService();
