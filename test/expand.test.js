// Regressionen für Sonderfälle realer Feeds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandCalendar } from '../src/expand.js';
import { buildData } from '../src/data.js';
import { validateConfig } from '../src/config.js';
import { redact } from '../src/fetch.js';

const cal = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:test', ...events.flat(), 'END:VCALENDAR'].join('\r\n');
const ev = (...lines) => ['BEGIN:VEVENT', 'DTSTAMP:20261101T000000Z', ...lines, 'END:VEVENT'];
const expand = (text, warn) => expandCalendar(text, { calendarId: 't', windowStart: '2026-09-01', windowEnd: '2027-12-31', warn });
const iso = (ms) => new Date(ms).toISOString();

test('Absage in Serie A lässt gleichzeitige Serie B unberührt', () => {
  const out = expand(cal(
    ev('UID:a', 'SUMMARY:A', 'DTSTART:20261201T090000Z', 'DTEND:20261201T100000Z', 'RRULE:FREQ=DAILY;COUNT=3'),
    ev('UID:b', 'SUMMARY:B', 'DTSTART:20261201T090000Z', 'DTEND:20261201T100000Z', 'RRULE:FREQ=DAILY;COUNT=3'),
    ev('UID:a', 'SUMMARY:A', 'RECURRENCE-ID:20261202T090000Z', 'DTSTART:20261202T090000Z', 'DTEND:20261202T100000Z', 'STATUS:CANCELLED'),
  ));
  assert.deepEqual(out.filter((o) => o.title === 'A').map((o) => o.startDate), ['2026-12-01', '2026-12-03']);
  assert.deepEqual(out.filter((o) => o.title === 'B').map((o) => o.startDate), ['2026-12-01', '2026-12-02', '2026-12-03']);
});

test('fremde Zeitzone ohne VTIMEZONE wird umgerechnet', () => {
  const [o] = expand(cal(ev('UID:ny', 'SUMMARY:NY', 'DTSTART;TZID=America/New_York:20261202T090000', 'DTEND;TZID=America/New_York:20261202T100000', 'RRULE:FREQ=WEEKLY;COUNT=1')));
  assert.equal(iso(o.start), '2026-12-02T14:00:00.000Z'); // 15:00 in Berlin
});

test('Outlook-Serie mit UNTIL in UTC behält den letzten Termin', () => {
  const out = expand(cal(ev('UID:o', 'SUMMARY:O', 'DTSTART;TZID=W. Europe Standard Time:20261112T190000',
    'DTEND;TZID=W. Europe Standard Time:20261112T200000', 'RRULE:FREQ=WEEKLY;UNTIL=20261126T180000Z')));
  assert.deepEqual(out.map((o) => o.startDate), ['2026-11-12', '2026-11-19', '2026-11-26']);
  assert.ok(out.every((o) => new Date(o.start).getUTCHours() === 18));
});

test('Dauer über die Zeitumstellung stimmt (00:30 bis 03:30 am 25.10.)', () => {
  const [o] = expand(cal(ev('UID:d', 'SUMMARY:Nacht', 'DTSTART;TZID=Europe/Berlin:20261025T003000', 'DTEND;TZID=Europe/Berlin:20261025T033000',
    'RRULE:FREQ=DAILY;COUNT=2')));
  assert.equal(iso(o.end), '2026-10-25T02:30:00.000Z'); // 03:30 Winterzeit
});

test('RDATE ohne RRULE: DTSTART gehört dazu, EXDATE wirkt', () => {
  const out = expand(cal(ev('UID:r', 'SUMMARY:R', 'DTSTART:20261119T090000Z', 'DTEND:20261119T100000Z', 'RDATE:20261120T090000Z,20261121T090000Z')));
  assert.deepEqual(out.map((o) => o.startDate).sort(), ['2026-11-19', '2026-11-20', '2026-11-21']);
  const ex = expand(cal(ev('UID:r', 'SUMMARY:R', 'DTSTART:20261119T090000Z', 'DTEND:20261119T100000Z', 'RDATE:20261120T090000Z', 'EXDATE:20261119T090000Z')));
  assert.deepEqual(ex.map((o) => o.startDate), ['2026-11-20']);
});

test('unbekannte Zeitzone wird gemeldet und als Berliner Zeit gelesen', () => {
  const warnings = [];
  const [o] = expand(cal(ev('UID:u', 'SUMMARY:U', 'DTSTART;TZID=Irgendwo:20261202T090000', 'DTEND;TZID=Irgendwo:20261202T100000')), (w) => warnings.push(w));
  assert.equal(iso(o.start), '2026-12-02T08:00:00.000Z');
  assert.match(warnings.join(), /Irgendwo/);
});

test('Termin-ID bleibt gleich, wenn der Termin verschoben wird', async () => {
  const config = validateConfig({ calendars: [{ id: 'x', name: 'X', color: '#000000', url: 'https://calendar.example.org/x.ics' }] });
  const idFor = async (start) => {
    const text = cal(ev('UID:fest', 'SUMMARY:Fest', `DTSTART:${start}`, 'DTEND:20261212T230000Z'));
    const d = await buildData({ config, now: Date.parse('2026-11-19T08:00:00Z'), fetchImpl: async () => new Response(text) });
    return d.events[0].id;
  };
  assert.equal(await idFor('20261212T180000Z'), await idFor('20261212T190000Z'));
});

test('Fehlermeldungen enthalten keine Adressen', () => {
  assert.equal(redact('Request cannot be constructed from a URL that includes credentials: https://user:pw@host/feed.ics'),
    'Request cannot be constructed from a URL that includes credentials: <Adresse>');
});
