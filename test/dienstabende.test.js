import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { loadConfig, validateConfig } from '../src/config.js';
import { buildData } from '../src/data.js';
import { selectDienstabende, pluginJson, berlinIso } from '../src/dienstabende.js';

const NOW = Date.parse('2026-11-19T08:00:00+01:00');
// Regex aus Classes/Domain/EventMapper.php des TYPO3-Plugins
const PLUGIN_ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:?\d{2})?)?$/;

const config = await loadConfig(resolve('calendars.json'));
const data = await buildData({ config, now: NOW });
const list = selectDienstabende(data, config.dienstabende, NOW);

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
    dienstabende: { calendars: ['b'] },
  }), /unbekannter Kalender "b"/);
});
