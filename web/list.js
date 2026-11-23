// Terminliste (Dienstabende, Jugendbereitschaft …), gesteuert über Query-Parameter (wie die
// Optionen des TYPO3-Plugins):
//   darstellung = liste (Standard) | monate | naechster
//   anzahl      = höchstens so viele Termine, 0 = alle (Standard 5)
//   mehr        = Adresse für den Knopf „Alle Termine ansehen“ (optional, http/https;
//                 nur wenn die Liste in calendars.json moreButton nicht abschaltet)
// Alle Termindaten werden nur als Text eingesetzt.
(() => {
  'use strict';
  const data = JSON.parse(document.getElementById('list-data').textContent);
  const root = document.getElementById('app');
  const q = new URLSearchParams(location.search);

  const DISPLAY = { liste: 'list', list: 'list', monate: 'months', months: 'months', naechster: 'next', 'nächster': 'next', next: 'next' };
  const display = DISPLAY[(q.get('darstellung') || '').toLowerCase()] || 'list';
  let limit = q.has('anzahl') ? parseInt(q.get('anzahl'), 10) : 5;
  if (!Number.isFinite(limit) || limit < 0) limit = 5;
  const more = data.moreButton === false ? null : (() => {
    try { const u = new URL(q.get('mehr') || ''); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; }
  })();

  const today = (() => {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: data.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())) p[x.type] = x.value;
    return p.year + '-' + p.month + '-' + p.day;
  })();
  let events = data.events.filter((e) => e.endDate >= today);
  if (limit > 0) events = events.slice(0, limit);

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v);
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  }
  const lines = (text) => text.split('\n').flatMap((l, i) => (i ? [h('br'), l] : [l]));

  function accordion(list, openFirst) {
    return list.map((e, i) => h('details', { open: openFirst && i === 0 },
      h('summary', null, h('strong', null, e.dayShort, e.time ? ' · ' + e.time + ' Uhr' : null), h('br'), e.title),
      h('div', { class: 'content' },
        e.description ? h('p', null, lines(e.description)) : null,
        h('p', null,
          h('strong', null, 'Wann:'), ' ', e.dayLong, e.time ? ', ab ' + e.time + ' Uhr' : null,
          e.location ? [h('br'), h('strong', null, 'Wo:'), ' ', e.location] : null))));
  }

  // Für das CSS: „Nächster Termin“ steht schmal und ohne Schattenabstand.
  document.documentElement.dataset.display = display;

  const out = [];
  if (!events.length) out.push(h('p', null, 'Zurzeit sind keine Termine geplant.'));
  else if (display === 'next') {
    const e = events[0];
    out.push(h('h4', { class: 'next' }, (data.nextLabel || 'Nächster Termin') + ': ', e.dayLong, e.time ? ', ' + e.time + ' Uhr' : null),
      h('p', null, e.title, e.location ? ' – ' + e.location : null));
  } else if (display === 'months') {
    const months = new Map();
    for (const e of events) { if (!months.has(e.month)) months.set(e.month, []); months.get(e.month).push(e); }
    let first = true;
    for (const [month, list] of months) { out.push(h('h3', { class: 'month' }, month), accordion(list, first)); first = false; }
  } else {
    out.push(accordion(events, true));
  }
  // target=_top: im iframe öffnet der Link die Seite im ganzen Fenster, nicht im Rahmen
  if (more) out.push(h('p', { class: 'more' }, h('a', { class: 'button', href: more, target: '_top' }, 'Alle Termine ansehen')));
  root.replaceChildren(...out.flat(Infinity));

  if (window.parent !== window) {
    let last = 0;
    const post = () => {
      const height = Math.ceil(document.documentElement.getBoundingClientRect().height);
      if (height !== last) { last = height; window.parent.postMessage({ type: 'drk-kalender:height', height }, '*'); }
    };
    new ResizeObserver(post).observe(document.documentElement);
    addEventListener('load', post);
  }
})();
