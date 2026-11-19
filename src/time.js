// Date and time helpers. Everything the calendar shows is Europe/Berlin wall time,
// independent of the machine's time zone (GitHub runners run in UTC).

export const TZ = 'Europe/Berlin';

const partFormatters = new Map();
function partFormatter(tz) {
  let f = partFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    partFormatters.set(tz, f);
  }
  return f;
}

export const pad = (n) => String(n).padStart(2, '0');

/** Wall-clock parts of an instant in a time zone. */
export function wallParts(ms, tz = TZ) {
  const out = {};
  for (const p of partFormatter(tz).formatToParts(new Date(ms))) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out;
}

function offsetMs(ms, tz) {
  const p = wallParts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** Instant of a wall-clock time in a time zone (handles DST; times in the spring gap move forward). */
export function wallTimeToEpoch({ year, month, day, hour = 0, minute = 0, second = 0 }, tz = TZ) {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let t = asUtc - offsetMs(asUtc, tz);
  const second2 = asUtc - offsetMs(t, tz);
  if (second2 !== t) t = second2;
  return t;
}

export function isValidTimeZone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** 'YYYY-MM-DD' of an instant in Berlin. */
export function dateKey(ms, tz = TZ) {
  const p = wallParts(ms, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function timeOfDay(ms, tz = TZ) {
  const p = wallParts(ms, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function keyToUtc(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(key, n) {
  return new Date(keyToUtc(key) + n * 86400000).toISOString().slice(0, 10);
}

/** 'YYYY-MM' shifted by n months. */
export function addMonths(monthKey, n) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function lastDayOfMonth(monthKey) {
  return addDays(addMonths(monthKey, 1) + '-01', -1);
}

const fmtCache = new Map();
function de(opts) {
  const k = JSON.stringify(opts);
  if (!fmtCache.has(k)) fmtCache.set(k, new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', ...opts }));
  return fmtCache.get(k);
}
/** German labels for date keys ('YYYY-MM-DD'). */
export const formatDate = (key, opts) => de(opts).format(new Date(keyToUtc(key)));
