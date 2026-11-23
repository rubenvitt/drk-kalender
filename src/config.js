import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { REGISTRATION_TYPES } from './registration.js';

const FORMATS = ['ical', 'hiorg'];
// Directories and files the build writes itself; a list must not overwrite them.
const RESERVED_PATHS = ['ics', 'fonts', 'events', 'embed', 'einbetten', 'index'];
const isWordList = (v) => Array.isArray(v) && v.length > 0 && v.every((w) => typeof w === 'string' && w.trim());

/**
 * Reads and validates calendars.json. Each calendar names exactly one source:
 *   "url"     public iCal address (webcal:// is accepted)
 *   "urlEnv"  name of an environment variable holding the address (for secret links)
 *   "file"    local .ics file, relative to the config file (sample data, tests)
 * Optional "format": "ical" (default) or "hiorg" (JSON of the HiOrg-Server calendar subscription).
 * Optional "titleFilter": { include?: string[], exclude?: string[] } (see title-filter.js).
 * "lists": list pages like the TYPO3 plugin drk_dienstabende, each under /<id>/.
 */
export async function loadConfig(path) {
  const abs = resolve(path);
  const raw = JSON.parse(await readFile(abs, 'utf8'));
  return validateConfig(raw, dirname(abs));
}

export function validateConfig(raw, baseDir = process.cwd()) {
  const errors = [];
  const calendars = Array.isArray(raw?.calendars) ? raw.calendars : [];
  if (!calendars.length) errors.push('"calendars" fehlt oder ist leer');
  const seen = new Set();
  calendars.forEach((c, i) => {
    const at = `calendars[${i}]${c?.id ? ` (${c.id})` : ''}`;
    if (!/^[a-z0-9-]+$/.test(c?.id ?? '')) errors.push(`${at}: "id" nur aus a-z, 0-9 und -`);
    else if (seen.has(c.id)) errors.push(`${at}: "id" doppelt`);
    seen.add(c?.id);
    if (!c?.name) errors.push(`${at}: "name" fehlt`);
    if (!/^#[0-9a-f]{6}$/i.test(c?.color ?? '')) errors.push(`${at}: "color" muss #rrggbb sein`);
    const sources = ['url', 'urlEnv', 'file'].filter((k) => c?.[k]);
    if (sources.length !== 1) errors.push(`${at}: genau eins von "url", "urlEnv", "file" angeben`);
    if (c?.format != null && !FORMATS.includes(c.format)) errors.push(`${at}: "format" muss ${FORMATS.join(' oder ')} sein`);
    const r = c?.registration;
    if (r) {
      if (!REGISTRATION_TYPES.includes(r.type)) errors.push(`${at}: registration.type muss ${REGISTRATION_TYPES.join(', ')} sein`);
      if (r.type === 'url' && !/^https?:\/\//.test(r.url ?? '')) errors.push(`${at}: registration.url fehlt`);
      if (r.type === 'mailto' && !/^[^@\s]+@[^@\s]+$/.test(r.to ?? '')) errors.push(`${at}: registration.to fehlt`);
    }
    const tf = c?.titleFilter;
    if (tf != null) {
      const ok = typeof tf === 'object' && ['include', 'exclude'].every((k) => tf[k] == null || isWordList(tf[k]));
      if (!ok) errors.push(`${at}: titleFilter.include und titleFilter.exclude müssen Listen von Wörtern sein`);
    }
  });
  const monthsBack = raw?.window?.monthsBack ?? 2;
  const monthsAhead = raw?.window?.monthsAhead ?? 12;
  if (![monthsBack, monthsAhead].every((n) => Number.isInteger(n) && n >= 0 && n <= 36)) {
    errors.push('"window.monthsBack" und "window.monthsAhead" müssen ganze Zahlen von 0 bis 36 sein');
  }
  if (raw?.dienstabende != null) errors.push('"dienstabende" heißt jetzt "lists": [{ "id": "dienstabende", … }]');
  const lists = raw?.lists ?? [];
  if (!Array.isArray(lists)) errors.push('"lists" muss eine Liste sein');
  const listIds = new Set();
  (Array.isArray(lists) ? lists : []).forEach((l, i) => {
    const at = `lists[${i}]${l?.id ? ` (${l.id})` : ''}`;
    if (!/^[a-z0-9-]+$/.test(l?.id ?? '') || RESERVED_PATHS.includes(l.id)) errors.push(`${at}: "id" nur aus a-z, 0-9 und -, nicht ${RESERVED_PATHS.join(', ')}`);
    else if (listIds.has(l.id)) errors.push(`${at}: "id" doppelt`);
    listIds.add(l?.id);
    if (!l?.title || typeof l.title !== 'string') errors.push(`${at}: "title" fehlt`);
    if (!Array.isArray(l?.calendars) || !l.calendars.length) errors.push(`${at}: "calendars" fehlt`);
    else for (const id of l.calendars) if (!seen.has(id)) errors.push(`${at}: unbekannter Kalender "${id}"`);
    for (const k of ['titlePrefix', 'nextLabel']) if (l?.[k] != null && typeof l[k] !== 'string') errors.push(`${at}: "${k}" muss Text sein`);
    if (l?.moreButton != null && typeof l.moreButton !== 'boolean') errors.push(`${at}: "moreButton" muss true oder false sein`);
  });
  if (errors.length) throw new Error('calendars.json ist ungültig:\n  - ' + errors.join('\n  - '));
  return {
    title: raw.title || 'Termine',
    window: { monthsBack, monthsAhead },
    lists: (lists ?? []).map((l) => ({ moreButton: true, nextLabel: 'Nächster Termin', ...l })),
    calendars: calendars.map((c) => ({ ...c, file: c.file ? resolve(baseDir, c.file) : undefined })),
  };
}
