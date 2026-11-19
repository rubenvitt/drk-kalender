import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { REGISTRATION_TYPES } from './registration.js';

/**
 * Reads and validates calendars.json. Each calendar names exactly one source:
 *   "url"     public iCal address (webcal:// is accepted)
 *   "urlEnv"  name of an environment variable holding the address (for secret links)
 *   "file"    local .ics file, relative to the config file (sample data, tests)
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
    const r = c?.registration;
    if (r) {
      if (!REGISTRATION_TYPES.includes(r.type)) errors.push(`${at}: registration.type muss ${REGISTRATION_TYPES.join(', ')} sein`);
      if (r.type === 'url' && !/^https?:\/\//.test(r.url ?? '')) errors.push(`${at}: registration.url fehlt`);
      if (r.type === 'mailto' && !/^[^@\s]+@[^@\s]+$/.test(r.to ?? '')) errors.push(`${at}: registration.to fehlt`);
    }
  });
  const monthsBack = raw?.window?.monthsBack ?? 2;
  const monthsAhead = raw?.window?.monthsAhead ?? 12;
  if (![monthsBack, monthsAhead].every((n) => Number.isInteger(n) && n >= 0 && n <= 36)) {
    errors.push('"window.monthsBack" und "window.monthsAhead" müssen ganze Zahlen von 0 bis 36 sein');
  }
  if (errors.length) throw new Error('calendars.json ist ungültig:\n  - ' + errors.join('\n  - '));
  return {
    title: raw.title || 'Termine',
    window: { monthsBack, monthsAhead },
    calendars: calendars.map((c) => ({ ...c, file: c.file ? resolve(baseDir, c.file) : undefined })),
  };
}
