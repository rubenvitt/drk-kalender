// Title filter per calendar: when one feed carries the events of several groups (the HiOrg
// subscriptions of Bereitschaft and Jugendbereitschaft contain the same events), marker words
// in the title decide where an event belongs.
//   "include": only events with one of the words (as a whole word, any case); a leading
//              marker is removed from the title ("JB: Erste Hilfe" -> "Erste Hilfe")
//   "exclude": events with one of the words are dropped

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alternatives = (words) => words.map((w) => escapeRegex(w.trim())).filter(Boolean).join('|');

/** Matches one of the words, not as part of a longer word ("JB" matches "JB: …", not "JBX"). */
export function wordsRegex(words) {
  const alt = alternatives(words ?? []);
  return alt ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, 'iu') : null;
}

/** Leading marker with optional brackets and separator: "JB: ", "[JBR] ", "Jugendbereitschaft – ". */
function leadingRegex(words) {
  const alt = alternatives(words ?? []);
  return alt ? new RegExp(`^\\s*[\\[(]?(?:${alt})[\\])]?(?![\\p{L}\\p{N}])\\s*[:–—-]?\\s*`, 'iu') : null;
}

/**
 * @param {{include?: string[], exclude?: string[]}} [filter]
 * @returns {(occurrences: object[]) => object[]}
 */
export function titleFilter(filter) {
  const include = wordsRegex(filter?.include);
  const exclude = wordsRegex(filter?.exclude);
  const leading = leadingRegex(filter?.include);
  if (!include && !exclude) return (list) => list;
  return (list) => list
    .filter((o) => (!include || include.test(o.title)) && (!exclude || !exclude.test(o.title)))
    .map((o) => (leading ? { ...o, title: o.title.replace(leading, '') || o.title } : o));
}
