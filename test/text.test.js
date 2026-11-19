import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, safeHttpUrl } from '../src/text.js';
import { jsonForScript } from '../src/render.js';
import { fold } from '../src/ics-export.js';

test('HTML-Beschreibungen werden zu Text, Skripte verschwinden', () => {
  const t = cleanText('Gilt für <b>Führerschein</b>.<br><br>Mehr: <a href="https://example.org/x">Kursinfos</a><script>alert(1)</script> &amp; mehr');
  assert.equal(t, 'Gilt für Führerschein.\n\nMehr: Kursinfos (https://example.org/x) & mehr');
});

test('Links mit anderem Schema als http(s) bleiben nur Text', () => {
  assert.equal(cleanText('<a href="javascript:alert(1)">klick</a>'), 'klick');
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpUrl('https://example.org/a b'), 'https://example.org/a%20b');
});

test('Text ohne HTML bleibt erhalten, auch mit spitzen Klammern', () => {
  assert.equal(cleanText('Alter < 18 > 12'), 'Alter < 18 > 12');
});

test('Daten im Script-Tag können es nicht schließen', () => {
  const s = jsonForScript({ t: '</script><script>alert(1)</script>' });
  assert.ok(!s.includes('</script'));
  assert.equal(JSON.parse(s).t, '</script><script>alert(1)</script>');
});

test('iCal-Zeilen werden bei 75 Bytes gefaltet, ohne Umlaute zu zerteilen', () => {
  const line = 'DESCRIPTION:' + 'ä'.repeat(80);
  const folded = fold(line);
  for (const l of folded.split('\r\n')) assert.ok(Buffer.byteLength(l) <= 75);
  assert.equal(folded.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join(''), line);
});
