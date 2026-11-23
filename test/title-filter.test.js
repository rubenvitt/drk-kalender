import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titleFilter, wordsRegex } from '../src/title-filter.js';

const WORDS = ['JB', 'JBR', 'Jugendbereitschaft'];

test('Markerwörter zählen nur als ganzes Wort, Groß-/Kleinschreibung egal', () => {
  const re = wordsRegex(WORDS);
  for (const t of ['JB Gruppenstunde', 'JB: Quiz', 'JBR - Zeltlager', 'Ausflug JB Heide-Park', 'Dienstabend (JBR)', 'Fest der jugendbereitschaft', '[JB] Quiz']) {
    assert.ok(re.test(t), t);
  }
  for (const t of ['JBX-Treffen', 'Dienstabend', 'AJB Sitzung', 'Jugendbereitschaftsleitung']) assert.ok(!re.test(t), t);
});

test('include behält nur passende Termine und entfernt den Marker am Anfang', () => {
  const titles = titleFilter({ include: WORDS })(
    ['JB: Quiz', '[JBR] Zeltlager', 'Jugendbereitschaft – Ausflug', 'Ausflug JB', 'Dienstabend', 'JB'].map((title) => ({ title })),
  ).map((o) => o.title);
  assert.deepEqual(titles, ['Quiz', 'Zeltlager', 'Ausflug', 'Ausflug JB', 'JB']);
});

test('exclude entfernt passende Termine, ohne Filter bleibt alles', () => {
  const list = ['Dienstabend JBR: Kinder', 'Dienstabend: Funk'].map((title) => ({ title }));
  assert.deepEqual(titleFilter({ exclude: WORDS })(list).map((o) => o.title), ['Dienstabend: Funk']);
  assert.equal(titleFilter(undefined)(list), list);
});
