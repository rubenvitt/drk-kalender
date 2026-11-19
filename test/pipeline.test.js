// Ende-zu-Ende über HTTP: die Beispielkalender werden von einem lokalen Server geladen,
// genau wie später die echten Feeds.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ICAL from 'ical.js';
import { startStaticServer } from '../scripts/static-server.js';
import { validateConfig } from '../src/config.js';
import { buildData } from '../src/data.js';
import { buildSite } from '../src/build.js';
import { sourceUrl } from '../src/fetch.js';

const NOW = Date.parse('2026-11-19T08:00:00+01:00');
let server;
let requests = [];
let data;

const config = (overrides = {}) => validateConfig({
  title: 'Test',
  window: { monthsBack: 2, monthsAhead: 12 },
  calendars: [
    { id: 'blutspende', name: 'Blutspende', color: '#e60005', url: server.url + 'blutspende.ics',
      registration: { type: 'url', url: 'https://example.org/r?t={title}&d={date}' } },
    { id: 'bereitschaft', name: 'Bereitschaft', color: '#002d55', url: server.url + 'bereitschaft.ics', registration: { type: 'event-url' } },
    { id: 'kurse', name: 'Kurse', color: '#2276d0', urlEnv: 'TEST_KURSE_URL', registration: { type: 'event-url' } },
    { id: 'cafe', name: 'Café', color: '#00848c', url: server.url + 'cafe.ics' },
    { id: 'sport', name: 'Sport', color: '#5a8f1c', url: server.url + 'sport.ics' },
    ...(overrides.extra ?? []),
  ],
});
const env = () => ({ TEST_KURSE_URL: server.url + 'kurse.ics' });
const find = (title, date) => data.events.filter((e) => e.title.startsWith(title) && (!date || e.days.includes(date)));

before(async () => {
  server = await startStaticServer(resolve('samples'), { onRequest: (req) => requests.push(req.url) });
  data = await buildData({ config: config(), now: NOW, env: env(), sourceOptions: { retries: 0 } });
});
after(() => server.close());

test('webcal:// wird als https:// abgerufen', () => {
  assert.equal(sourceUrl({ url: 'webcal://calendar.example.org/a.ics' }).href, 'https://calendar.example.org/a.ics');
  assert.throws(() => sourceUrl({ url: 'file:///etc/passwd' }));
});

test('alle Kalender wurden per HTTP geladen (auch über urlEnv)', () => {
  for (const f of ['blutspende', 'bereitschaft', 'kurse', 'cafe', 'sport']) assert.ok(requests.includes(`/${f}.ics`), f);
  assert.deepEqual(data.warnings, []);
});

test('Zeitfenster: zwei Monate zurück, zwölf voraus', () => {
  assert.deepEqual(data.window, { firstMonth: '2026-09', lastMonth: '2027-11', startDate: '2026-09-01', endDate: '2027-11-30' });
  assert.ok(data.events.every((e) => e.days.every((d) => d >= '2026-09-01' && d <= '2027-11-30')));
  assert.ok(data.events.length > 300);
});

test('Serie über die Zeitumstellung bleibt um 09:30 Ortszeit (Outlook-Zeitzone ohne VTIMEZONE)', () => {
  for (const d of ['2027-03-26', '2027-04-02', '2026-10-23', '2026-10-30']) {
    const [ev] = find('Rehasport Herz', d);
    assert.ok(ev, d);
    assert.equal(ev.time, '09:30', d);
  }
  assert.equal(find('Rehasport Herz', '2027-03-26')[0].start, '2027-03-26T08:30:00.000Z');
  assert.equal(find('Rehasport Herz', '2027-04-02')[0].start, '2027-04-02T07:30:00.000Z');
  assert.equal(find('Rehasport Herz', '2027-05-07').length, 0, 'UNTIL beendet die Serie');
});

test('EXDATE fällt weg, RECURRENCE-ID verschiebt und benennt um', () => {
  assert.equal(find('Dienstabend', '2026-12-23').length, 0);
  assert.equal(find('Dienstabend', '2026-12-30').length, 0);
  assert.equal(find('Dienstabend', '2026-11-25').length, 0);
  const [moved] = find('Dienstabend', '2026-11-26');
  assert.equal(moved.title, 'Dienstabend: Praxisübung mit Fahrzeugen');
  assert.equal(moved.time, '18:30');
  assert.equal(find('Dienstabend: Reanimation', '2026-11-04').length, 1);
  assert.equal(find('Dienstabend', '2027-01-06')[0].title, 'Dienstabend');
});

test('abgesagter Einzeltermin einer Serie erscheint nicht', () => {
  assert.equal(find('Erste-Hilfe-Kurs', '2026-12-19').length, 0);
  assert.equal(find('Erste-Hilfe-Kurs', '2026-12-05').length, 1);
});

test('ganztägig: ein Tag bleibt ein Tag, DTEND ist exklusiv', () => {
  assert.deepEqual(find('Tag der offenen Tür')[0].days, ['2026-12-05']);
  const [lehrgang] = find('Sanitätsausbildung');
  assert.deepEqual(lehrgang.days, ['2027-01-15', '2027-01-16', '2027-01-17']);
  assert.equal(lehrgang.timeLabel, 'ganztägig');
});

test('Termin bis 2 Uhr nachts erscheint nur am ersten Tag', () => {
  const [ball] = find('Sanitätsdienst: Winterball');
  assert.deepEqual(ball.days, ['2027-01-23']);
  assert.match(ball.timeLabel, /bis Sonntag, 24\. Januar, 02:00 Uhr/);
});

test('Zeit ohne Zone gilt als Berliner Zeit', () => {
  assert.equal(find('Tanzen im Sitzen')[0].start, '2026-11-30T14:00:00.000Z');
});

test('gleiche UID in zwei Kalendern ergibt einen Termin mit beiden Kalendern', () => {
  const evs = find('Blutspende Uelzen', '2026-12-03');
  assert.equal(evs.length, 1);
  assert.deepEqual(evs[0].calendars, ['blutspende', 'bereitschaft']);
});

test('monatliche Regeln: erster Sonntag, letzter Mittwoch', () => {
  assert.equal(find('Erzählcafé', '2026-12-06').length, 1);
  assert.equal(find('Spielenachmittag', '2026-12-30').length, 1);
  assert.equal(find('Spielenachmittag', '2026-12-23').length, 0);
});

test('Anmeldung: URL des Termins, sonst keine; Vorlage wird gefüllt und kodiert', () => {
  assert.equal(find('Erste-Hilfe-Kurs', '2026-12-05')[0].registration.href, 'https://www.example.org/anmeldung/erste-hilfe-kurs');
  assert.equal(find('Dienstabend', '2026-12-02')[0].registration, null);
  assert.equal(find('Quartierscafé', '2026-12-01')[0].registration, null);
  assert.equal(find('Blutspende Ebstorf')[0].registration.href, 'https://example.org/r?t=Blutspende%20Ebstorf&d=15.12.2026');
});

test('HTML aus Google-Beschreibungen kommt als Text an', () => {
  const [kurs] = find('Erste-Hilfe-Kurs', '2026-12-05');
  assert.ok(!/[<>]/.test(kurs.description));
  assert.match(kurs.description, /Führerschein/);
  assert.doesNotMatch(kurs.description, /alert/);
});

test('fast jeden Tag ein Termin (Beispieldaten)', () => {
  const days = new Set(data.events.flatMap((e) => e.days).filter((d) => d.startsWith('2026-11')));
  assert.ok(days.size >= 25, `nur ${days.size} Tage`);
});

test('ein nicht erreichbarer Kalender bricht den Build ab und nennt ihn', async () => {
  const cfg = config({ extra: [{ id: 'kaputt', name: 'Kaputt', color: '#000000', url: server.url + 'gibt-es-nicht.ics' }] });
  await assert.rejects(buildData({ config: cfg, now: NOW, env: env(), sourceOptions: { retries: 0 } }),
    (e) => /Kalender "kaputt".*HTTP 404/.test(e.message));
});

test('fehlendes Secret wird gemeldet, ohne Adressen zu verraten', async () => {
  await assert.rejects(buildData({ config: config(), now: NOW, env: {}, sourceOptions: { retries: 0 } }),
    (e) => /TEST_KURSE_URL ist nicht gesetzt/.test(e.message) && !e.message.includes('kurse.ics'));
});

test('Antwort ohne iCal (etwa eine Login-Seite) wird abgelehnt', async () => {
  const cfg = validateConfig({ calendars: [{ id: 'login', name: 'Login', color: '#000000', url: 'https://calendar.example.org/x.ics' }] });
  const fetchImpl = async () => new Response('<!doctype html><title>Anmelden</title>', { status: 200 });
  await assert.rejects(buildData({ config: cfg, now: NOW, fetchImpl, sourceOptions: { retries: 0 } }),
    (e) => /Kalender "login" \(calendar\.example\.org\): Antwort ist kein iCal/.test(e.message));
});

test('ungültige Konfiguration wird mit allen Fehlern abgelehnt', () => {
  assert.throws(() => validateConfig({ calendars: [{ id: 'A B', color: 'rot', url: 'x', file: 'y' }] }),
    (e) => /id/.test(e.message) && /name/.test(e.message) && /color/.test(e.message) && /genau eins/.test(e.message));
});

test('Build schreibt Seite, Daten und gültige .ics-Dateien', async () => {
  const out = await mkdtemp(join(tmpdir(), 'drk-kalender-'));
  try {
    const cfgPath = join(out, 'calendars.json');
    await writeFile(cfgPath, JSON.stringify({
      calendars: [{ id: 'bereitschaft', name: 'Bereitschaft', color: '#002d55', url: server.url + 'bereitschaft.ics' }],
    }));
    const { data: d } = await buildSite({ configPath: cfgPath, outDir: join(out, 'dist'), now: NOW, log: () => {} });
    const html = await readFile(join(out, 'dist', 'index.html'), 'utf8');
    assert.equal(html.match(/<\/script/g).length, 2);
    const ev = d.events.find((e) => e.title === 'Dienstabend: Praxisübung mit Fahrzeugen');
    const ics = new ICAL.Component(ICAL.parse(await readFile(join(out, 'dist', ev.ics), 'utf8')));
    const vevent = new ICAL.Event(ics.getFirstSubcomponent('vevent'));
    assert.equal(vevent.summary, ev.title);
    assert.equal(vevent.startDate.toJSDate().toISOString(), '2026-11-26T17:30:00.000Z');
    for (const f of ['einbetten.html', 'embed.js', 'events.json', 'fonts/open-sans-700.woff2']) await readFile(join(out, 'dist', f));
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
