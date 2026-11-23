import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { loadConfig, validateConfig } from '../src/config.js';
import { buildData } from '../src/data.js';
import { selectDienstabende, pluginJson, berlinIso } from '../src/dienstabende.js';

const NOW = Date.parse('2026-11-19T08:00:00+01:00');
// Regex aus Classes/Domain/EventMapper.php des TYPO3-Plugins
const PLUGIN_ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:?\d{2})?)?$/;

const config = await loadConfig(resolve('samples/calendars.json'));
const data = await buildData({ config, now: NOW });
const listConfig = (id) => config.lists.find((l) => l.id === id);
const list = selectDienstabende(data, listConfig('dienstabende'), NOW);
const jugend = selectDienstabende(data, listConfig('jugend'), NOW);

test('nur Dienstabende der Bereitschaft, ab gestern, Präfix im Titel entfernt', () => {
  assert.ok(list.length > 20);
  assert.ok(list.every((e) => e.endDate >= '2026-11-18'));
  assert.ok(!list.some((e) => /Sanitätsdienst|Quartierscafé/.test(e.title)));
  const moved = list.find((e) => e.startDate === '2026-11-26');
  assert.equal(moved.title, 'Praxisübung mit Fahrzeugen');
  assert.equal(moved.dayShort, 'Do., 26.11.');
  assert.equal(moved.dayLong, 'Donnerstag, 26. November');
  assert.equal(moved.time, '18:30');
  assert.equal(list.find((e) => e.startDate === '2027-01-06').title, 'Dienstabend');
});

test('dienstabende.json passt zum TYPO3-Plugin', () => {
  const json = pluginJson(list);
  assert.ok(json.events.every((e) => PLUGIN_ISO.test(e.start) && e.title));
  assert.equal(json.events.find((e) => e.start.startsWith('2026-11-26')).start, '2026-11-26T18:30:00+01:00');
  assert.equal(berlinIso(Date.parse('2027-06-02T17:00:00Z')), '2027-06-02T19:00:00+02:00');
});

test('dienstabende: unbekannter Kalender wird abgelehnt', () => {
  assert.throws(() => validateConfig({
    calendars: [{ id: 'a', name: 'A', color: '#000000', url: 'https://x.example/a.ics' }],
    lists: [{ id: 'x', title: 'X', calendars: ['b'] }],
  }), /unbekannter Kalender "b"/);
});

test('alte Einstellung "dienstabende" und reservierte Listen-IDs werden abgelehnt', () => {
  const calendars = [{ id: 'a', name: 'A', color: '#000000', url: 'https://x.example/a.ics' }];
  assert.throws(() => validateConfig({ calendars, dienstabende: { calendars: ['a'] } }), /heißt jetzt "lists"/);
  assert.throws(() => validateConfig({ calendars, lists: [{ id: 'ics', title: 'X', calendars: ['a'] }] }), /"id" nur aus/);
  assert.throws(() => validateConfig({ calendars: [{ ...calendars[0], titleFilter: { include: 'JB' } }] }), /titleFilter/);
});

test('Jugendbereitschaft: nur Termine mit JB, JBR oder Jugendbereitschaft im Titel', () => {
  assert.deepEqual(jugend.slice(0, 6).map((e) => [e.startDate, e.title]), [
    ['2026-11-27', 'Erste-Hilfe-Quiz'],
    ['2026-12-18', 'Weihnachtsfeier der Jugendbereitschaft'],
    ['2027-01-15', 'Zeltlager vorbereiten'],
    ['2027-01-29', 'Gruppenstunde'],
    ['2027-02-12', 'Dienstabend JBR: Erste Hilfe für Kinder'],
    ['2027-02-12', 'Gruppenstunde'],
  ]);
  assert.ok(!jugend.some((e) => /Funk|JBX/.test(e.title)), 'Termine der Bereitschaft und JBX fallen weg');
  assert.equal(jugend.find((e) => e.startDate === '2026-11-27').description, 'Für alle von 10 bis 16 Jahren.\nBitte Getränk mitbringen.');
});

test('Jugend-Termine stehen nicht bei der Bereitschaft und im Kalender nur einmal', () => {
  assert.ok(!list.some((e) => /JBR?\b|Jugendbereitschaft/.test(e.title)));
  const kids = data.events.filter((e) => e.title === 'Dienstabend JBR: Erste Hilfe für Kinder');
  assert.equal(kids.length, 1);
  assert.deepEqual(kids[0].calendars, ['jugend']);
  assert.equal(data.events.filter((e) => e.title.includes('Funk und Kommunikation')).length, 1);
  assert.ok(data.events.filter((e) => e.calendars.includes('jugend')).every((e) => e.calendars.length === 1));
});
