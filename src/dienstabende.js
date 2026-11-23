// Listenansichten wie im TYPO3-Plugin drk_dienstabende (Dienstabende, Jugendbereitschaft): eine
// Auswahl der Termine (bestimmte Kalender, optional Titel mit Präfix) als Liste, nach Monaten oder
// als Hinweis. Daneben <id>.json im Format, das das Plugin liest.

import { addDays, dateKey, wallParts, pad, formatDate } from './time.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Offset form the plugin accepts: 2026-11-26T18:30:00+01:00 (no milliseconds). */
export function berlinIso(ms) {
  const p = wallParts(ms);
  const offsetMin = Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000) / 60000);
  const sign = offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(offsetMin);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// "Mi., 11.11." wie ICU im Plugin (EEE, dd.MM.); Node liefert den Wochentag je nach ICU ohne Punkt
const dayShort = (k) => `${formatDate(k, { weekday: 'short' }).replace(/\.?$/, '.')}, ${k.slice(8)}.${k.slice(5, 7)}.`;
const dayLong = (k) => formatDate(k, { weekday: 'long', day: 'numeric', month: 'long' });
const monthLabel = (k) => formatDate(k, { month: 'long', year: 'numeric' });

/**
 * @param data   result of buildData
 * @param view   one entry of config.lists: { calendars?: string[], titlePrefix?: string }
 */
export function selectDienstabende(data, view, now) {
  const calendars = new Set(view.calendars?.length ? view.calendars : data.calendars.map((c) => c.id));
  const prefix = view.titlePrefix?.trim();
  const match = prefix ? new RegExp(`^${escapeRegex(prefix)}\\b`, 'i') : null;
  const strip = prefix ? new RegExp(`^${escapeRegex(prefix)}\\s*[:–—-]\\s*`, 'i') : null;
  // Past events are dropped in the browser (the page is built hourly); keep yesterday as a margin.
  const from = addDays(dateKey(now), -1);
  return data.events
    .filter((e) => e.endDate >= from && e.calendars.some((c) => calendars.has(c)) && (!match || match.test(e.title)))
    .map((e) => ({
      id: e.id,
      startDate: e.startDate,
      endDate: e.endDate,
      start: e.start,
      time: e.allDay ? '' : e.time,
      title: (strip && e.title.replace(strip, '')) || e.title,
      description: e.description,
      location: e.location,
      dayShort: dayShort(e.startDate),
      dayLong: dayLong(e.startDate),
      month: monthLabel(e.startDate),
    }));
}

/** JSON for the TYPO3 plugin (fields: start, title, description, location). */
export function pluginJson(events) {
  return {
    events: events.map((e) => ({
      start: e.start ? berlinIso(Date.parse(e.start)) : e.startDate,
      title: e.title,
      ...(e.description ? { description: e.description } : {}),
      ...(e.location ? { location: e.location } : {}),
    })),
  };
}
