/**
 * Discovers which characters and costumes are installed.
 *
 * Primary: Queries /api/characters from the backend database.
 * Fallback: Scans static /models/index.json.
 */
export interface Costume {
  id: string;
  name: string;
  /** model3.json path, relative to the character directory. */
  model: string;
}

export interface Character {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  nicknames?: string[];
  defaultCostume?: string;
  activeCostumeId?: string;
  costumes: Costume[];
  /** Motion index path, relative to the character directory. Optional. */
  motions?: string;
  /** Directory of voice clips, relative to the character directory. Optional. */
  voice?: string;
  /** Filled in on load so callers can resolve the relative paths above. */
  dir: string;
  expressions?: string[];
}

export const MODELS_ROOT = '/models';

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function loadRegistry(
  onProblem: (msg: string) => void = () => {},
  root = MODELS_ROOT
): Promise<Character[]> {
  // Try dynamic backend API first
  try {
    const apiChars = await json<any[]>('/api/characters');
    if (apiChars && Array.isArray(apiChars) && apiChars.length > 0) {
      return apiChars.map((c) => ({
        id: c.id,
        name: c.display_name || c.name,
        displayName: c.display_name || c.name,
        description: c.description || '',
        defaultCostume: c.default_costume_id,
        activeCostumeId: c.active_costume_id,
        costumes: (c.costumes || []).map((cs: any) => ({
          id: cs.costume_slug || cs.id,
          name: cs.name,
          model: cs.model_path
        })),
        motions: 'motions/index.json',
        voice: c.tts_voice_ref || 'voice',
        dir: `${root}/${c.model_dir || c.name}`,
        expressions: c.expressions || []
      }));
    }
  } catch {
    // API not available, fall through
  }

  // Fallback: static index.json
  const raw = await json<unknown>(`${root}/index.json`);
  if (raw === null) {
    onProblem(`no ${root}/index.json or backend characters found`);
    return [];
  }

  const slugs: string[] = Array.isArray(raw)
    ? raw.filter((s): s is string => typeof s === 'string')
    : typeof raw === 'string'
      ? [raw]
      : [];

  const loaded = await Promise.all(
    slugs.map(async (slug) => {
      const dir = `${root}/${slug}`;
      const c = await json<Character>(`${dir}/character.json`);
      if (c === null) {
        onProblem(`${slug}: no character.json in ${dir}`);
        return null;
      }
      if (!c.costumes?.length) {
        onProblem(`${slug}: character.json has no costumes`);
        return null;
      }
      return { ...c, id: c.id || slug, dir };
    })
  );
  return loaded.filter((c): c is Character => c !== null);
}

export function pickCostume(character: Character, id?: string): Costume {
  if (!character.costumes || character.costumes.length === 0) {
    return { id: 'default', name: 'Default', model: '' };
  }
  const match = (targetId?: string): Costume | undefined => {
    if (!targetId) return undefined;
    const t = targetId.trim().toLowerCase();
    return character.costumes.find(
      (c) =>
        c.id.toLowerCase() === t ||
        (c as any).costume_slug?.toLowerCase() === t ||
        c.id.toLowerCase().endsWith(`::${t}`) ||
        t.endsWith(`::${c.id.toLowerCase()}`) ||
        c.name.toLowerCase() === t
    );
  };

  return (
    match(id) ??
    match(character.activeCostumeId) ??
    match(character.defaultCostume) ??
    character.costumes[0]
  );
}

/** Splits a model path into the directory to load from and the file inside it. */
export function resolveModel(character: Character, costume: Costume) {
  const full = `${character.dir}/${costume.model}`;
  const cut = full.lastIndexOf('/');
  return { dir: full.slice(0, cut), file: full.slice(cut + 1) };
}
