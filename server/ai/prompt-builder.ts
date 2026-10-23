import { CharacterRow, dbManager } from '../db/client';

export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function buildSystemPrompt(character: CharacterRow): string {
  const costumes = dbManager.getCostumesForCharacter(character.id);
  const costumeListStr = costumes.map(c => `"${c.costume_slug}" (${c.name})`).join(', ');

  const memories = dbManager.getMemories(character.id, 10);
  const memorySection = memories.length > 0
    ? `\n\nCORE MEMORIES ABOUT USER:\n${memories.map(m => `- ${m.fact}`).join('\n')}`
    : '';

  return `${character.system_prompt}

## COMPANION GUIDELINES & RESPONSE FORMAT
1. ALWAYS start your reply with exactly ONE emotion tag from: [HAPPY], [SAD], [SURPRISED], [ANGRY], [THINKING], [NEUTRAL].
2. You can also trigger bodily motions by adding [motion: <name>] such as [motion: nod], [motion: wave], [motion: bow], [motion: smile].
3. You can change your costume/outfit when asked using [costume: <slug>]. Available costumes: ${costumeListStr || 'default'}.
4. Keep replies natural, expressive, and conversational (1-3 sentences).
5. Never break character. You are ${character.display_name || character.name}.${memorySection}`;
}

export function buildConversationMessages(
  character: CharacterRow,
  history: { role: 'user' | 'assistant'; content: string }[],
  latestUserMessage: string
): PromptMessage[] {
  const systemPrompt = buildSystemPrompt(character);
  const msgs: PromptMessage[] = [{ role: 'system', content: systemPrompt }];

  for (const h of history.slice(-10)) {
    msgs.push({ role: h.role, content: h.content });
  }

  msgs.push({ role: 'user', content: latestUserMessage });
  return msgs;
}
