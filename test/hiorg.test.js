import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expandHiorg, cleanHiorgUrl } from '../src/hiorg.js';
import { buildData } from '../src/data.js';
import { validateConfig } from '../src/config.js';
import { selectDienstabende } from '../src/dienstabende.js';
import { loadSource } from '../src/fetch.js';

const NOW = Date.parse('2026-11-20T09:00:00+01:00');
const FIXTURE = resolve('test/fixtures/hiorg.json');
const text = await readFile(FIXTURE, 'utf8');
const window = { calendarId: 'bereitschaft', windowStart: '2026-09-01', windowEnd: '2027-11-30' };

test('HiOrg-JSON wird zu Einzelterminen (Unix-Sekunden, Berliner Zeit)', () => {
  const list = expandHiorg(text, window);
  assert.equal(list.length, 5);
  const skat = list.find((o) => o.title === 'Dienstabend: Skat und Knobeln');
  assert.equal(skat.uid, 'hiorg-16280460');
  assert.equal(new Date(skat.start).toISOString(), '2026-11-25T17:00:00.000Z'); // Mi. 18:00 Uhr
  assert.equal(skat.startDate, '2026-11-25');
  assert.equal(skat.location, 'Bereitschaft Uelzen, Miesbacher Straße 4, 29525 Uelzen');
  assert.equal(skat.description, '');
});

test('Treffpunkt steht vor der Bemerkung', () => {
  const cbrn = expandHiorg(text, window).find((o) => o.title.startsWith('Ausbildung CBRN'));
  assert.match(cbrn.description, /^Treffpunkt: Raum 4 ab 08:30\n\nGrundausbildung CBRN\nVorraussetzung:/);
});

test('Links: Entities aufgelöst, Sitzung (sida) entfernt', () => {
  for (const o of expandHiorg(text, window)) {
    assert.ok(!o.url.includes('sida'), o.url);
    assert.ok(!o.url.includes('&amp;'), o.url);
  }
  assert.equal(cleanHiorgUrl('https://www.hiorg-server.de/formulare.php?ovx=uel&amp;rt=t&amp;ri=1&amp;sida=abc'),
    'https://www.hiorg-server.de/formulare.php?ovx=uel&rt=t&ri=1');
  assert.equal(cleanHiorgUrl('javascript:alert(1)'), null);
});

test('Fehlerantwort von HiOrg bricht ab', () => {
  assert.throws(() => expandHiorg('{"success":false,"status":"403"}', window), /HiOrg meldet einen Fehler \(Status 403\)/);
  assert.throws(() => expandHiorg('<html>', window), /kein JSON/);
});

test('format "hiorg" läuft durch die ganze Pipeline bis zu den Dienstabenden', async () => {
  const config = validateConfig({
    calendars: [{ id: 'bereitschaft', name: 'Bereitschaft', color: '#002d55', file: FIXTURE, format: 'hiorg',
      registration: { type: 'event-url', label: 'Zum Dienst melden' } }],
    dienstabende: { calendars: ['bereitschaft'], titlePrefix: 'Dienstabend' },
  });
  const data = await buildData({ config, now: NOW });
  assert.equal(data.events.length, 5);
  assert.match(data.events[0].registration.href, /^https:\/\/www\.hiorg-server\.de\/formulare\.php\?ovx=uel&rt=t&ri=\d+&zid=\d+$/);
  const titles = selectDienstabende(data, config.dienstabende, NOW).map((e) => e.title);
  assert.deepEqual(titles, ['Skat und Knobeln', 'UAV - Notfallverfahren', 'Dienstabend Sanität', 'Henry Dunant und die Gründung des DRK']);
});

test('format wird geprüft, JSON ohne VCALENDAR wird nur bei hiorg angenommen', async () => {
  assert.throws(() => validateConfig({ calendars: [{ id: 'a', name: 'A', color: '#000000', file: FIXTURE, format: 'json' }] }), /"format" muss ical oder hiorg sein/);
  await assert.rejects(loadSource({ id: 'a', file: FIXTURE }), /kein iCal/);
  assert.ok((await loadSource({ id: 'a', file: FIXTURE, format: 'hiorg' })).startsWith('{'));
});
