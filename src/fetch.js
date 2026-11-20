import { readFile } from 'node:fs/promises';

const USER_AGENT = 'drk-kalender (statischer Kalender-Build)';

/** Removes anything that looks like an address (fetch errors can contain the full URL with credentials). */
export const redact = (msg) => String(msg).replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<Adresse>');

/** Error text never contains the address itself: urlEnv addresses are secret. */
function describe(cal) {
  if (cal.file) return cal.file;
  if (cal.urlEnv) return `Adresse aus ${cal.urlEnv}`;
  try { return new URL(cal.url.replace(/^webcals?:/i, 'https:')).hostname; } catch { return 'Adresse'; }
}

export function sourceUrl(cal, env = process.env) {
  const value = cal.urlEnv ? env[cal.urlEnv] : cal.url;
  if (!value) throw new Error(`Umgebungsvariable ${cal.urlEnv} ist nicht gesetzt`);
  const url = new URL(value.trim().replace(/^webcals?:\/\//i, 'https://'));
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('nur http(s)- und webcal-Adressen');
  return url;
}

/** Loads the iCal text of one calendar. Throws with a readable reason. */
export async function loadSource(cal, { env = process.env, fetchImpl = fetch, timeoutMs = 20000, retries = 2 } = {}) {
  try {
    let text;
    if (cal.file) {
      text = await readFile(cal.file, 'utf8');
    } else {
      const url = sourceUrl(cal, env);
      let lastError;
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, 1000 * attempt));
        try {
          const res = await fetchImpl(url, {
            headers: { 'User-Agent': USER_AGENT, Accept: cal.format === 'hiorg' ? 'application/json' : 'text/calendar, text/plain;q=0.8, */*;q=0.5' },
            signal: AbortSignal.timeout(timeoutMs),
            redirect: 'follow',
          });
          if (!res.ok) {
            lastError = new Error(`HTTP ${res.status}`);
            if (res.status >= 400 && res.status < 500 && res.status !== 429) break; // will not get better
            continue;
          }
          text = await res.text();
          break;
        } catch (e) {
          const reason = e.cause?.code ?? e.cause?.message;
          lastError = new Error(e.name === 'TimeoutError' ? `keine Antwort nach ${timeoutMs / 1000} s` : reason ? `${e.message} (${reason})` : e.message);
        }
      }
      if (text === undefined) throw lastError;
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (cal.format !== 'hiorg' && !/^\s*BEGIN:VCALENDAR/i.test(text)) throw new Error('Antwort ist kein iCal (BEGIN:VCALENDAR fehlt)');
    return text;
  } catch (e) {
    throw new Error(`Kalender "${cal.id}" (${describe(cal)}): ${redact(e.message)}`);
  }
}
