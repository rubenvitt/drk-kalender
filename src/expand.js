// Parses one iCal feed and expands it into single occurrences inside a date window.
// Recurrence rules, EXDATE, RDATE and RECURRENCE-ID overrides are handled by ical.js;
// converting wall-clock times to instants is done here with the IANA time zone data
// of the runtime, so the result does not depend on the build machine's zone.

import ICAL from 'ical.js';
import { TZ, wallTimeToEpoch, wallParts, isValidTimeZone, dateKey, addDays, pad } from './time.js';
import { cleanText, safeHttpUrl } from './text.js';

// Outlook/Exchange export Windows zone names, often without a VTIMEZONE block.
const WINDOWS_ZONES = {
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'Romance Standard Time': 'Europe/Paris',
  'GMT Standard Time': 'Europe/London',
  'Coordinated Universal Time': 'UTC',
};
const MAX_OCCURRENCES_PER_SERIES = 20000;
const TZ_PROPERTIES = ['dtstart', 'dtend', 'due', 'exdate', 'rdate', 'recurrence-id'];

/** IANA name for a TZID: Windows names, Mozilla-style prefixes ("/mozilla.org/…/Europe/Berlin"), IANA itself. */
function ianaFor(tzid) {
  const mozilla = tzid.match(/([A-Za-z]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)$/)?.[1];
  for (const candidate of [WINDOWS_ZONES[tzid], tzid, mozilla]) {
    if (candidate && isValidTimeZone(candidate)) return candidate;
  }
  return null;
}

const offsetAt = (ms, iana) => {
  const p = wallParts(ms, iana);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
};
const fmtOffset = (ms) => {
  const s = Math.round(Math.abs(ms) / 1000);
  return (ms < 0 ? '-' : '+') + pad(Math.floor(s / 3600)) + pad(Math.floor((s % 3600) / 60)) + (s % 60 ? pad(s % 60) : '');
};
const fmtLocal = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');

/**
 * Builds a VTIMEZONE from the runtime's time zone data, so recurrence expansion (and UNTIL
 * in UTC) works for feeds that name a zone without defining it, as Outlook does.
 */
export function vtimezoneFromIntl(tzid, iana, fromYear = 1990, toYear = 2045) {
  const DAY = 86400000;
  let t = Date.UTC(fromYear, 0, 1);
  const end = Date.UTC(toYear, 0, 1);
  let prev = offsetAt(t, iana);
  const lines = ['BEGIN:VTIMEZONE', `TZID:${tzid}`,
    'BEGIN:STANDARD', `DTSTART:${fmtLocal(t + prev)}`, `TZOFFSETFROM:${fmtOffset(prev)}`, `TZOFFSETTO:${fmtOffset(prev)}`, 'END:STANDARD'];
  for (; t < end; t += DAY) {
    const next = offsetAt(t + DAY, iana);
    if (next === prev) continue;
    let lo = t, hi = t + DAY; // offset changes in (lo, hi]
    while (hi - lo > 60000) {
      const mid = lo + Math.floor((hi - lo) / 120000) * 60000;
      if (offsetAt(mid, iana) === prev) lo = mid; else hi = mid;
    }
    const kind = next > prev ? 'DAYLIGHT' : 'STANDARD';
    lines.push(`BEGIN:${kind}`, `DTSTART:${fmtLocal(hi + prev)}`, `TZOFFSETFROM:${fmtOffset(prev)}`, `TZOFFSETTO:${fmtOffset(next)}`, `END:${kind}`);
    prev = next;
  }
  lines.push('END:VTIMEZONE');
  return new ICAL.Component(ICAL.parse(lines.join('\r\n')));
}

function registerMissingZones(vcal, warn, calendarId) {
  const tzids = new Set();
  for (const ev of vcal.getAllSubcomponents('vevent')) {
    for (const name of TZ_PROPERTIES) {
      for (const prop of ev.getAllProperties(name)) {
        const tzid = prop.getParameter('tzid');
        if (tzid) tzids.add(tzid);
      }
    }
  }
  for (const tzid of tzids) {
    if (ICAL.TimezoneService.has(tzid)) continue;
    const iana = ianaFor(tzid);
    if (iana) ICAL.TimezoneService.register(new ICAL.Timezone(vtimezoneFromIntl(tzid, iana)));
    else warn(`${calendarId}: unbekannte Zeitzone "${tzid}", gelesen als ${TZ}`);
  }
}

const timeKey = (t) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;

function resolveZone(time, floatingZone) {
  if (time.zone === ICAL.Timezone.utcTimezone || time.zone?.tzid === 'UTC') return { iana: 'UTC' };
  const tzid = time.timezone || (time.zone && time.zone.tzid !== 'floating' ? time.zone.tzid : null);
  if (!tzid) return { iana: floatingZone };
  const iana = ianaFor(tzid);
  if (iana) return { iana };
  if (time.zone && time.zone.tzid === tzid && time.zone.component) return { useVtimezone: true };
  return { iana: floatingZone, unknown: tzid };
}

function toEpoch(time, ctx) {
  const zone = resolveZone(time, ctx.floatingZone);
  if (zone.useVtimezone) return time.toUnixTime() * 1000;
  const parts = { year: time.year, month: time.month, day: time.day, hour: time.hour, minute: time.minute, second: Math.min(time.second, 59) };
  if (zone.iana === 'UTC') return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wallTimeToEpoch(parts, zone.iana);
}

// durationMs: for occurrences generated from a series, the exact duration of the series
// (RFC 5545, 3.8.5.3). ical.js adds it to the local wall time, which is wrong across DST.
function occurrence(item, start, end, recurrenceId, ctx, durationMs = null) {
  const status = String(item.component.getFirstPropertyValue('status') || '').toUpperCase();
  if (status === 'CANCELLED') return null;

  const base = {
    uid: item.uid,
    recurrenceId: recurrenceId ? recurrenceId.toString() : null,
    title: cleanText(item.summary) || 'Termin',
    location: cleanText(item.location),
    description: cleanText(item.description),
    url: safeHttpUrl(item.component.getFirstPropertyValue('url')),
    tentative: status === 'TENTATIVE',
  };

  if (start.isDate) {
    const startDate = timeKey(start);
    const endExclusive = end ? timeKey(end) : addDays(startDate, 1);
    const endDate = endExclusive > startDate ? addDays(endExclusive, -1) : startDate;
    return { ...base, allDay: true, start: null, end: null, startDate, endDate };
  }
  const startMs = toEpoch(start, ctx);
  let endMs = durationMs != null ? startMs + durationMs : end ? toEpoch(end, ctx) : startMs;
  if (endMs < startMs) endMs = startMs;
  const startDate = dateKey(startMs);
  const endDate = endMs > startMs ? dateKey(endMs - 1) : startDate;
  return { ...base, allDay: false, start: startMs, end: endMs, startDate, endDate };
}

function calendarsOf(root) {
  return root.name === 'vcalendar' ? [root] : root.getAllSubcomponents('vcalendar');
}

/**
 * @param {string} text  iCal data
 * @param {{calendarId: string, windowStart: string, windowEnd: string, warn?: (msg: string) => void}} options
 *   windowStart/windowEnd are inclusive 'YYYY-MM-DD' keys
 */
export function expandCalendar(text, { calendarId, windowStart, windowEnd, warn = () => {} }) {
  let jcal;
  try {
    jcal = ICAL.parse(text);
  } catch (e) {
    throw new Error(`${calendarId}: iCal-Daten nicht lesbar (${e.message})`);
  }
  const roots = (Array.isArray(jcal[0]) ? jcal : [jcal]).map((j) => new ICAL.Component(j));
  const result = [];
  // Overrides can move an occurrence by a few weeks; iterate a bit past the window.
  const iterateUntil = addDays(windowEnd, 60);

  for (const vcal of roots.flatMap(calendarsOf)) {
    for (const vtz of vcal.getAllSubcomponents('vtimezone')) {
      try { ICAL.TimezoneService.register(vtz); } catch { /* broken VTIMEZONE: replaced below if the name is known */ }
    }
    registerMissingZones(vcal, warn, calendarId);
    const xwr = vcal.getFirstPropertyValue('x-wr-timezone');
    const ctx = {
      floatingZone: xwr && isValidTimeZone(xwr) ? xwr : TZ,
    };

    const masters = new Map();
    const exceptions = new Map();
    for (const comp of vcal.getAllSubcomponents('vevent')) {
      const uid = comp.getFirstPropertyValue('uid') || `ohne-uid-${masters.size + exceptions.size}`;
      if (comp.hasProperty('recurrence-id')) {
        if (!exceptions.has(uid)) exceptions.set(uid, []);
        exceptions.get(uid).push(comp);
      } else {
        masters.set(uid, comp);
      }
    }

    for (const [uid, comp] of masters) {
      // Pass the exceptions explicitly: without them, ical.js relates every RECURRENCE-ID
      // component of the calendar to this event, whatever its UID.
      const own = (exceptions.get(uid) ?? []).map((c) => new ICAL.Event(c));
      exceptions.delete(uid);
      const event = new ICAL.Event(comp, { exceptions: own, strictExceptions: true });
      if (!event.isRecurring()) {
        result.push(occurrence(event, event.startDate, event.endDate, null, ctx));
        continue;
      }
      const durationMs = !event.startDate.isDate && comp.hasProperty('dtend')
        ? toEpoch(event.endDate, ctx) - toEpoch(event.startDate, ctx)
        : !event.startDate.isDate && comp.hasProperty('duration') ? event.duration.toSeconds() * 1000 : null;
      const push = (recurrenceId) => {
        const d = event.getOccurrenceDetails(recurrenceId);
        const isOverride = d.item !== event;
        result.push(isOverride
          ? occurrence(d.item, d.item.startDate, d.item.endDate, d.recurrenceId, ctx)
          : occurrence(event, d.startDate, d.endDate, d.recurrenceId, ctx, durationMs));
        return d.recurrenceId.toString();
      };
      const seen = new Set();
      const it = event.iterator();
      let next;
      let count = 0;
      while ((next = it.next())) {
        if (timeKey(next) > iterateUntil) break;
        if (++count > MAX_OCCURRENCES_PER_SERIES) {
          warn(`${calendarId}: Serie "${event.summary}" nach ${MAX_OCCURRENCES_PER_SERIES} Terminen abgeschnitten`);
          break;
        }
        seen.add(push(next));
      }
      // DTSTART is always the first instance; ical.js leaves it out when there is RDATE but no RRULE.
      const excluded = comp.getAllProperties('exdate').flatMap((p) => p.getValues())
        .some((v) => v.compare(event.startDate) === 0);
      if (!comp.hasProperty('rrule') && !excluded && !seen.has(event.startDate.toString())) push(event.startDate.clone());
    }
    // Overrides whose series is not in the feed: show them as single events.
    for (const comps of exceptions.values()) {
      for (const comp of comps) {
        const event = new ICAL.Event(comp);
        result.push(occurrence(event, event.startDate, event.endDate, event.recurrenceId, ctx));
      }
    }
  }

  return result.filter((o) => o && o.endDate >= windowStart && o.startDate <= windowEnd);
}
