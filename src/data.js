// Loads all calendars and turns them into the data the page renders.

import { createHash } from 'node:crypto';
import { loadSource } from './fetch.js';
import { expandCalendar } from './expand.js';
import { registrationFor } from './registration.js';
import { addDays, addMonths, lastDayOfMonth, wallParts, pad, timeOfDay, formatDate, TZ } from './time.js';

const MAX_DAYS_PER_EVENT = 62;
// A timed event that ends before this hour on the next day (a ball until 2 am)
// is shown on its first day only.
const OVERNIGHT_UNTIL_HOUR = 6;

export function computeWindow(now, { monthsBack, monthsAhead }) {
  const p = wallParts(now);
  const current = `${p.year}-${pad(p.month)}`;
  const firstMonth = addMonths(current, -monthsBack);
  const lastMonth = addMonths(current, monthsAhead);
  return { firstMonth, lastMonth, startDate: `${firstMonth}-01`, endDate: lastDayOfMonth(lastMonth) };
}

const longDate = (k) => formatDate(k, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const longDateNoYear = (k) => formatDate(k, { weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = (k) => formatDate(k, { day: '2-digit', month: '2-digit', year: 'numeric' });

function labels(o) {
  const multiDay = o.endDate !== o.startDate;
  if (o.allDay) {
    return {
      time: '',
      dateLabel: multiDay ? `${longDateNoYear(o.startDate)} bis ${longDate(o.endDate)}` : longDate(o.startDate),
      timeLabel: 'ganztägig',
    };
  }
  const t1 = timeOfDay(o.start);
  const t2 = timeOfDay(o.end);
  let timeLabel;
  if (o.end === o.start) timeLabel = `${t1} Uhr`;
  else if (!multiDay) timeLabel = `${t1} bis ${t2} Uhr`;
  else timeLabel = `${t1} Uhr bis ${longDateNoYear(o.endDate)}, ${t2} Uhr`;
  return { time: t1, dateLabel: longDate(o.startDate), timeLabel };
}

function daysOf(o, window) {
  let last = o.endDate;
  if (!o.allDay && last === addDays(o.startDate, 1) && wallParts(o.end).hour < OVERNIGHT_UNTIL_HOUR) last = o.startDate;
  const days = [];
  for (let d = o.startDate < window.startDate ? window.startDate : o.startDate; d <= last && d <= window.endDate; d = addDays(d, 1)) {
    days.push(d);
    if (days.length >= MAX_DAYS_PER_EVENT) break;
  }
  return days;
}

// Stays the same when an event is moved (same UID and RECURRENCE-ID), so shared
// links and imported .ics files keep working after the next build.
const hashId = (s) => createHash('sha256').update(s).digest('base64url').slice(0, 12);

/**
 * @returns {Promise<{generatedAt: string, generatedLabel: string, title: string, window: object,
 *   calendars: {id: string, name: string, color: string}[], events: object[], warnings: string[]}>}
 */
export async function buildData({ config, now = Date.now(), env = process.env, fetchImpl = fetch, sourceOptions = {} }) {
  const warnings = [];
  const warn = (m) => warnings.push(m);
  const window = computeWindow(now, config.window);

  const loaded = await Promise.allSettled(config.calendars.map((cal) => loadSource(cal, { env, fetchImpl, ...sourceOptions })));
  const failures = loaded.filter((r) => r.status === 'rejected').map((r) => r.reason.message);
  if (failures.length) {
    const err = new Error(`${failures.length} von ${config.calendars.length} Kalendern nicht geladen:\n  - ${failures.join('\n  - ')}`);
    err.failures = failures;
    throw err;
  }

  const merged = new Map();
  config.calendars.forEach((cal, i) => {
    const occurrences = expandCalendar(loaded[i].value, {
      calendarId: cal.id, windowStart: window.startDate, windowEnd: window.endDate, warn,
    });
    for (const o of occurrences) {
      const key = `${o.uid}|${o.recurrenceId ?? ''}|${o.start ?? o.startDate}`;
      const known = merged.get(key);
      if (known) {
        if (!known.calendars.includes(cal.id)) known.calendars.push(cal.id);
      } else {
        merged.set(key, { ...o, calendars: [cal.id] });
      }
    }
  });

  const rules = new Map(config.calendars.map((c) => [c.id, c.registration]));
  const usedIds = new Set();
  const events = [...merged.values()]
    .sort((a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      Number(b.allDay) - Number(a.allDay) ||
      (a.start ?? 0) - (b.start ?? 0) ||
      a.title.localeCompare(b.title, 'de'))
    .map((o) => {
      let id = hashId(`${o.uid}|${o.recurrenceId ?? ''}`);
      if (usedIds.has(id)) id = hashId(`${o.uid}|${o.recurrenceId ?? ''}|${o.start ?? o.startDate}`);
      usedIds.add(id);
      const view = {
        id,
        uid: o.uid,
        title: o.title,
        calendars: o.calendars,
        allDay: o.allDay,
        tentative: o.tentative || undefined,
        startDate: o.startDate,
        endDate: o.endDate,
        start: o.allDay ? null : new Date(o.start).toISOString(),
        end: o.allDay ? null : new Date(o.end).toISOString(),
        days: daysOf(o, window),
        ...labels(o),
        dateShort: shortDate(o.startDate),
        location: o.location || '',
        mapUrl: o.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.location)}` : null,
        description: o.description || '',
        url: o.url,
        ics: `ics/${id}.ics`,
      };
      view.registration = registrationFor(rules.get(o.calendars[0]), view);
      return view;
    })
    .filter((e) => e.days.length);

  const p = wallParts(now);
  return {
    generatedAt: new Date(now).toISOString(),
    generatedLabel: `${formatDate(`${p.year}-${pad(p.month)}-${pad(p.day)}`, { day: 'numeric', month: 'long', year: 'numeric' })}, ${timeOfDay(now)} Uhr`,
    timeZone: TZ,
    title: config.title,
    window,
    calendars: config.calendars.map(({ id, name, color }) => ({ id, name, color })),
    events,
    warnings,
  };
}
