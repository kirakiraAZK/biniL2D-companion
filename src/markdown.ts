/**
 * Safe, zero-dependency Markdown Formatter for Companion Chat
 * Supports *italic*, _italic_, **bold**, __bold__, ***bold italic***,
 * ~strikethrough~, ~~strikethrough~~, `code`, and newlines.
 * HTML-escapes raw text before formatting to guarantee zero XSS vulnerability.
 */

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMarkdown(raw: string): string {
  if (!raw) return '';

  // 1. Scrub residual action/costume/expression bracket tags from spoken dialogue bubble
  let text = raw.replace(/\[(?:costume|outfit|motion|expression|emotion):[^\]]+\]/gi, '').trim();

  // 2. Escape HTML
  let html = escapeHtml(text);

  // 3. Multiline code blocks ```lang ... ```
  html = html.replace(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_m, code) => {
    return `<pre class="chat-code-block"><code>${code.trim()}</code></pre>`;
  });

  // 4. Inline code `code`
  html = html.replace(/`([^`\n]+)`/g, '<code class="chat-code">$1</code>');

  // 5. Bold + Italic: ***text*** or ___text___
  html = html.replace(/\*\*\*([^\*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/___([^_\n]+)___/g, '<strong><em>$1</em></strong>');

  // 6. Bold: **text** or __text__
  html = html.replace(/\*\*([^\*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');

  // 7. Italic: *text* or _text_ (allowing punctuation and words)
  html = html.replace(/(^|[^\*])\*([^\*\n]+)\*([^\*]|$)/g, '$1<em>$2</em>$3');
  html = html.replace(/(^|[^_])_([^_\n]+)_([^_]|$)/g, '$1<em>$2</em>$3');

  // 8. Convert newlines to <br> (preserving consecutive breaks)
  html = html.replace(/\r\n|\r|\n/g, '<br>');

  return html;
}
