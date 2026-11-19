import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wallTimeToEpoch, dateKey, timeOfDay } from '../src/time.js';

test('Berliner Ortszeit vor und nach der Zeitumstellung', () => {
  assert.equal(new Date(wallTimeToEpoch({ year: 2027, month: 3, day: 26, hour: 9, minute: 30 })).toISOString(), '2027-03-26T08:30:00.000Z');
  assert.equal(new Date(wallTimeToEpoch({ year: 2027, month: 4, day: 2, hour: 9, minute: 30 })).toISOString(), '2027-04-02T07:30:00.000Z');
  assert.equal(new Date(wallTimeToEpoch({ year: 2026, month: 10, day: 25, hour: 12 })).toISOString(), '2026-10-25T11:00:00.000Z');
});

test('Datum und Uhrzeit hängen nicht von der Zeitzone der Maschine ab', () => {
  const t = Date.parse('2026-12-31T23:30:00Z'); // in Berlin schon 2027
  assert.equal(dateKey(t), '2027-01-01');
  assert.equal(timeOfDay(t), '00:30');
});
