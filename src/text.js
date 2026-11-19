// Turns iCal text fields into plain text. Feeds are untrusted: Google Calendar, for
// example, puts HTML into DESCRIPTION. The page only ever renders plain text.

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const HTML_HINT = /<\/?(a|b|br|p|div|span|i|em|strong|u|ul|ol|li|html|body|h[1-6])\b[^>]*>/i;

export function htmlToText(html) {
  let s = html.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi, (m, h1, h2, inner) => {
    const href = decodeEntities(h1 ?? h2 ?? '').trim();
    const text = decodeEntities(inner.replace(/<[^>]+>/g, '')).trim();
    if (!/^https?:\/\//i.test(href)) return text;
    return !text || text === href ? href : `${text} (${href})`;
  });
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n').replace(/<li\b[^>]*>/gi, '• ');
  s = s.replace(/<[^>]*>/g, '');
  return decodeEntities(s);
}

/** Plain, trimmed text with at most one empty line between paragraphs. */
export function cleanText(value) {
  if (value == null) return '';
  let t = String(value).replace(/\r\n?/g, '\n');
  if (HTML_HINT.test(t)) t = htmlToText(t);
  return t
    .split('\n')
    .map((l) => l.replace(/[ \t\xa0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Only http(s) URLs survive; everything else (javascript:, data:, …) becomes null. */
export function safeHttpUrl(value) {
  if (!value) return null;
  try {
    const u = new URL(String(value).trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}
