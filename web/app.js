// DRK-Kalender: Monatsansicht und Liste. Alle Termindaten kommen aus dem Build
// (#cal-data) und werden nur als Text eingesetzt, nie als HTML.
(() => {
  'use strict';

  const data = JSON.parse(document.getElementById('cal-data').textContent);
  const root = document.getElementById('app');
  const MAX_CHIPS = 3;

  const pad = (n) => String(n).padStart(2, '0');
  const keyToDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const addDays = (k, n) => new Date(keyToDate(k).getTime() + n * 864e5).toISOString().slice(0, 10);
  const addMonths = (mk, n) => {
    const [y, m] = mk.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1);
  };
  const fmt = (o) => new Intl.DateTimeFormat('de-DE', Object.assign({ timeZone: 'UTC' }, o));
  const F = {
    month: fmt({ month: 'long', year: 'numeric' }),
    dayLong: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
    num: fmt({ day: 'numeric' }),
  };
  const today = (() => {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: data.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())) p[x.type] = x.value;
    return p.year + '-' + p.month + '-' + p.day;
  })();

  const W = data.window;
  const cals = new Map(data.calendars.map((c) => [c.id, c]));
  const events = new Map(data.events.map((e) => [e.id, e]));
  const byDay = new Map();
  for (const ev of data.events) for (const d of ev.days) { if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(ev); }

  const inWindow = (k) => k >= W.startDate && k <= W.endDate;
  const clampMonth = (m) => (m < W.firstMonth ? W.firstMonth : m > W.lastMonth ? W.lastMonth : m);

  const state = { month: clampMonth(today.slice(0, 7)), selected: null, view: 'month', hidden: new Set(), open: null };
  const visible = (ev) => ev.calendars.some((c) => !state.hidden.has(c));
  const eventsOn = (k) => (byDay.get(k) || []).filter(visible);

  function defaultDay(month) {
    if (today.slice(0, 7) === month) return today;
    for (let k = month + '-01'; k.slice(0, 7) === month; k = addDays(k, 1)) if (eventsOn(k).length) return k;
    return month + '-01';
  }
  state.selected = defaultDay(state.month);

  // --- kleine DOM-Helfer ------------------------------------------------------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk, sv);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  }
  const svg = (d) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2.5');
    p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    s.append(p);
    return s;
  };
  const ICON = { prev: 'M15 5l-7 7 7 7', next: 'M9 5l7 7-7 7', calendar: 'M5 6h14v14H5zM5 10h14M9 3v4M15 3v4', link: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6' };

  const safeHref = (u) => (typeof u === 'string' && /^(https?:|mailto:|data:text\/calendar|ics\/)/.test(u) ? u : null);

  function textWithLinks(text) {
    return text.split(/\n{2,}/).map((par) => {
      const out = [];
      const re = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g;
      let last = 0;
      const pushText = (s) => s.split('\n').forEach((line, i) => { if (i) out.push(h('br')); if (line) out.push(line); });
      for (const m of par.matchAll(re)) {
        pushText(par.slice(last, m.index));
        out.push(h('a', { href: m[0], target: '_blank', rel: 'noopener noreferrer' }, m[0].replace(/^https?:\/\/(www\.)?/, '')));
        last = m.index + m[0].length;
      }
      pushText(par.slice(last));
      return h('p', null, out);
    });
  }

  // --- Navigation -------------------------------------------------------------
  function setHash(v) { history.replaceState(null, '', '#' + v); }
  function goMonth(month, focusDay) {
    state.month = clampMonth(month);
    state.selected = defaultDay(state.month);
    state.open = null;
    setHash(state.month);
    render(focusDay ? 'd-' + state.selected : undefined);
  }
  function select(k, focus) {
    if (!inWindow(k)) return;
    state.selected = k;
    state.month = k.slice(0, 7);
    state.open = null;
    setHash(k);
    render(focus ? 'd-' + k : undefined);
  }
  function openEvent(ev, day) {
    state.selected = day;
    state.month = day.slice(0, 7);
    state.open = ev.id;
    setHash('termin/' + ev.id);
    render('ev-' + ev.id);
  }

  function applyHash() {
    const v = decodeURIComponent(location.hash.slice(1));
    let m;
    if ((m = v.match(/^termin\/([\w-]+)$/)) && events.has(m[1])) {
      const ev = events.get(m[1]);
      state.selected = ev.days.find(inWindow) || ev.days[0];
      state.month = state.selected.slice(0, 7);
      state.open = ev.id;
      state.view = 'month';
      return 'ev-' + ev.id;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(v) && inWindow(v)) { state.selected = v; state.month = v.slice(0, 7); state.open = null; }
    else if (/^\d{4}-\d{2}$/.test(v)) { state.month = clampMonth(v); state.selected = defaultDay(state.month); state.open = null; }
    return undefined;
  }

  // --- Bausteine ---------------------------------------------------------------
  function header() {
    const first = W.firstMonth, last = W.lastMonth;
    const nav = (dir, label, disabled) => h('button', {
      class: 'btn btn-secondary btn-round', type: 'button', 'aria-label': label, 'data-fk': dir, disabled,
      onclick: () => goMonth(addMonths(state.month, dir === 'prev' ? -1 : 1)),
    }, svg(ICON[dir]));
    return h('div', { class: 'cal-head' },
      h('h2', { class: 'cal-title', 'aria-live': 'polite' }, F.month.format(keyToDate(state.month + '-01'))),
      h('div', { class: 'cal-nav' },
        nav('prev', 'Vorheriger Monat', state.month <= first),
        h('button', { class: 'btn btn-secondary', type: 'button', 'data-fk': 'today', disabled: !inWindow(today),
          onclick: () => select(today, true) }, 'Heute'),
        nav('next', 'Nächster Monat', state.month >= last),
        viewToggle()));
  }

  function viewToggle() {
    const seg = (v, label) => h('button', { type: 'button', 'aria-pressed': String(state.view === v), 'data-fk': 'v-' + v,
      onclick: () => { state.view = v; render(); } }, label);
    return h('div', { class: 'seg', role: 'group', 'aria-label': 'Ansicht' }, seg('month', 'Monat'), seg('list', 'Liste'));
  }

  function toolbar() {
    if (data.calendars.length < 2) return null;
    return h('div', { class: 'filters', role: 'group', 'aria-label': 'Kalender ein- und ausblenden' },
        data.calendars.map((c) => h('button', {
          class: 'filter', type: 'button', 'aria-pressed': String(!state.hidden.has(c.id)), 'data-fk': 'f-' + c.id,
          style: { '--c': c.color },
          onclick: () => { state.hidden.has(c.id) ? state.hidden.delete(c.id) : state.hidden.add(c.id); render(); },
        }, h('span', { class: 'dot', 'aria-hidden': 'true' }), c.name)));
  }

  function onDayKey(e, k) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) { e.preventDefault(); const n = addDays(k, step); if (inWindow(n)) select(n, true); }
    else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); goMonth(addMonths(state.month, e.key === 'PageUp' ? -1 : 1), true); }
  }

  function monthGrid() {
    const first = state.month + '-01';
    const lead = (keyToDate(first).getUTCDay() + 6) % 7;
    const daysInMonth = Number(addDays(addMonths(state.month, 1) + '-01', -1).slice(8));
    const start = addDays(first, -lead);
    const cells = [];
    for (let i = 0; i < Math.ceil((lead + daysInMonth) / 7) * 7; i++) {
      const k = addDays(start, i);
      const evs = inWindow(k) ? eventsOn(k) : [];
      const isSel = k === state.selected;
      const colors = [...new Set(evs.map((e) => cals.get(e.calendars.find((c) => !state.hidden.has(c))).color))];
      const label = F.dayLong.format(keyToDate(k)) + (k === today ? ', heute' : '') + ', ' +
        (evs.length === 0 ? 'keine Termine' : evs.length === 1 ? '1 Termin' : evs.length + ' Termine');
      cells.push(h('div', { class: ['cell', k.slice(0, 7) !== state.month && 'is-other', k === today && 'is-today', isSel && 'is-selected'].filter(Boolean).join(' ') },
        h('button', { class: 'day', type: 'button', 'data-fk': 'd-' + k, 'aria-label': label, 'aria-pressed': String(isSel),
          'aria-current': k === today ? 'date' : null, tabindex: isSel ? '0' : '-1', disabled: !inWindow(k),
          onclick: () => select(k, true), onkeydown: (e) => onDayKey(e, k) },
        h('span', { class: 'num', 'aria-hidden': 'true' }, F.num.format(keyToDate(k)))),
        evs.length ? h('span', { class: 'dots', 'aria-hidden': 'true' }, colors.slice(0, 4).map((c) => h('i', { style: { '--c': c } }))) : null,
        evs.length ? h('ul', { class: 'chips', 'aria-hidden': 'true' },
          evs.slice(0, evs.length > MAX_CHIPS ? MAX_CHIPS - 1 : MAX_CHIPS).map((ev) => h('li', null,
            h('button', { class: 'chip', type: 'button', tabindex: '-1', title: ev.title, style: { '--c': cals.get(ev.calendars[0]).color },
              onclick: () => openEvent(ev, k) },
            k === ev.startDate && ev.time ? h('b', null, ev.time) : null, ev.title))),
          evs.length > MAX_CHIPS ? h('li', null, h('button', { class: 'more', type: 'button', tabindex: '-1', onclick: () => select(k, true) },
            '+' + (evs.length - MAX_CHIPS + 1) + ' weitere')) : null) : null));
    }
    const weekdays = [['Mo', 'Montag'], ['Di', 'Dienstag'], ['Mi', 'Mittwoch'], ['Do', 'Donnerstag'], ['Fr', 'Freitag'], ['Sa', 'Samstag'], ['So', 'Sonntag']];
    return h('div', { class: 'grid' }, weekdays.map(([s, l]) => h('div', { class: 'wd', 'aria-hidden': 'true' }, h('abbr', { title: l }, s))), cells);
  }

  function timeOf(ev, day) {
    if (ev.allDay) return h('span', { class: 'ev-time is-soft' }, 'ganztägig');
    if (day !== ev.startDate) return h('span', { class: 'ev-time is-soft' }, 'Fortsetzung');
    return h('span', { class: 'ev-time' }, ev.time);
  }

  function eventItem(ev, day) {
    const main = cals.get(ev.calendars[0]);
    const calNames = ev.calendars.map((c) => cals.get(c).name).join(', ');
    const actions = [];
    const reg = ev.registration && safeHref(ev.registration.href);
    if (reg) actions.push(h('a', { class: 'btn btn-primary', href: reg, target: reg.startsWith('mailto:') ? null : '_blank', rel: 'noopener noreferrer' }, ev.registration.label));
    const ics = safeHref(ev.ics);
    if (ics) actions.push(h('a', { class: 'btn btn-secondary', href: ics, download: 'termin.ics' }, svg(ICON.calendar), 'In meinen Kalender'));
    actions.push(h('a', { class: 'btn btn-tertiary', href: location.href.split('#')[0] + '#termin/' + ev.id, target: '_blank', rel: 'noopener' }, 'Link zum Termin'));

    const facts = [
      h('dt', null, 'Wann'), h('dd', null, ev.dateLabel, h('br'), ev.timeLabel),
    ];
    if (ev.location) {
      const map = safeHref(ev.mapUrl);
      facts.push(h('dt', null, 'Wo'), h('dd', null, ev.location, map ? [' ', h('a', { href: map, target: '_blank', rel: 'noopener noreferrer' }, 'Karte')] : null));
    }
    facts.push(h('dt', null, ev.calendars.length > 1 ? 'Kalender' : 'Bereich'), h('dd', null, calNames));

    const det = h('details', { class: 'ev', id: 'termin-' + ev.id, style: { '--c': main.color }, open: state.open === ev.id },
      h('summary', { 'data-fk': 'ev-' + ev.id },
        timeOf(ev, day),
        h('span', null,
          h('span', { class: 'ev-title' }, ev.title),
          h('span', { class: 'ev-meta' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), calNames, ev.tentative ? ' (vorläufig)' : null))),
      h('div', { class: 'ev-body' },
        h('dl', { class: 'facts' }, facts),
        ev.description ? h('div', { class: 'desc' }, textWithLinks(ev.description)) : null,
        h('div', { class: 'actions' }, actions)));
    det.addEventListener('toggle', () => {
      if (det.open) { state.open = ev.id; setHash('termin/' + ev.id); }
      else if (state.open === ev.id) { state.open = null; setHash(state.selected); }
    });
    return det;
  }

  const eventList = (evs, day) => h('ul', { class: 'ev-list' }, evs.map((ev) => h('li', null, eventItem(ev, day))));

  function agenda() {
    const k = state.selected;
    const evs = eventsOn(k);
    return h('section', { class: 'agenda', 'aria-labelledby': 'agenda-title' },
      h('h3', { class: 'agenda-title', id: 'agenda-title' }, F.dayLong.format(keyToDate(k)), k === today ? ' (heute)' : null),
      evs.length ? eventList(evs, k) : h('p', { class: 'empty' }, 'An diesem Tag sind keine Termine eingetragen.'));
  }

  function listView() {
    const days = [];
    for (let k = state.month + '-01'; k.slice(0, 7) === state.month; k = addDays(k, 1)) {
      const evs = inWindow(k) ? eventsOn(k) : [];
      if (evs.length) days.push(h('section', { class: 'list-day' + (k === today ? ' is-today' : '') },
        h('h3', null, F.dayLong.format(keyToDate(k)), k === today ? ' (heute)' : null), eventList(evs, k)));
    }
    return days.length ? h('div', null, days) : h('p', { class: 'empty' }, 'In diesem Monat sind keine Termine eingetragen.');
  }

  function render(focusKey) {
    const fk = focusKey || (document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : null);
    root.replaceChildren(
      ...[header(), toolbar()].filter(Boolean),
      state.view === 'month' ? h('div', { class: 'layout' }, monthGrid(), agenda()) : listView(),
      h('p', { class: 'foot' }, 'Stand: ' + data.generatedLabel + '. Kurzfristige Änderungen sind möglich.'));
    if (fk) {
      const el = root.querySelector('[data-fk="' + CSS.escape(fk) + '"]');
      if (el) el.focus({ preventScroll: !focusKey });
    }
  }

  const initialFocus = applyHash();
  render();
  if (initialFocus) {
    const el = document.getElementById('termin-' + state.open);
    if (el) el.scrollIntoView({ block: 'start' });
  }
  addEventListener('hashchange', () => { const f = applyHash(); render(f); });

  // Im iframe: Höhe an die einbettende Seite melden (embed.js passt das iframe an).
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
