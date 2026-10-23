export function splitSentences(text: string, minChunkChars = 25): string[] {
  const clean = text.trim();
  if (!clean) return [];

  // Split on sentence-ending punctuation followed by whitespace or string end
  const parts = clean.split(/(?<=[.!?。！？\n])\s+/);
  const filtered = parts.map(p => p.trim()).filter(Boolean);

  if (filtered.length <= 1) return filtered;

  const merged: string[] = [];
  let current = filtered[0];

  for (let i = 1; i < filtered.length; i++) {
    const next = filtered[i];
    if (current.length < minChunkChars) {
      current += ' ' + next;
    } else {
      merged.push(current);
      current = next;
    }
  }

  if (current) merged.push(current);
  return merged;
}
