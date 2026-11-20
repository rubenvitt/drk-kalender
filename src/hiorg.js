// HiOrg-Server "Kalender-Abo" (kalender_abo.php?ov=…&code=…) liefert JSON statt iCal:
//   { success: true, data: [{ id, sortdate, enddate, verbez, verort, treff, bemerkung, url, … }] }
// sortdate/enddate sind Unix-Sekunden. Daraus werden dieselben Einzeltermine wie in expand.js.

import { dateKey } from './time.js';
import { cleanText, decodeEntities, safeHttpUrl } from './text.js';

/**
 * Link to the event form without "sida": HiOrg puts the session of whoever fetched
 * the feed into every link, and that must not end up on a public page.
 */
export function cleanHiorgUrl(value) {
  const href = safeHttpUrl(decodeEntities(String(value ?? '')));
  if (!href) return null;
  const url = new URL(href);
  url.searchParams.delete('sida');
  return url.href;
}

/**
 * @param {string} text  HiOrg JSON
 * @param {{calendarId: string, windowStart: string, windowEnd: string}} options
 */
export function expandHiorg(text, { calendarId, windowStart, windowEnd }) {
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`${calendarId}: HiOrg-Antwort ist kein JSON (${e.message})`);
  }
  if (json?.success !== true || !Array.isArray(json.data)) {
    throw new Error(`${calendarId}: HiOrg meldet einen Fehler (Status ${json?.status ?? 'unbekannt'})`);
  }
  return json.data
    .filter((t) => Number.isFinite(t?.sortdate))
    .map((t) => {
      const start = t.sortdate * 1000;
      const end = Number.isFinite(t.enddate) && t.enddate * 1000 > start ? t.enddate * 1000 : start;
      const treff = cleanText(t.treff);
      const bemerkung = cleanText(t.bemerkung);
      return {
        uid: `hiorg-${t.id}`,
        recurrenceId: null,
        title: cleanText(t.verbez) || 'Termin',
        location: cleanText(t.verort),
        description: [treff && `Treffpunkt: ${treff}`, bemerkung].filter(Boolean).join('\n\n'),
        url: cleanHiorgUrl(t.url),
        tentative: false,
        allDay: false,
        start,
        end,
        startDate: dateKey(start),
        endDate: end > start ? dateKey(end - 1) : dateKey(start),
      };
    })
    .filter((o) => o.endDate >= windowStart && o.startDate <= windowEnd);
}
