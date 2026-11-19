// Builds the HTML pages. CSS, script and data are inlined so the calendar is a single request.

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const BACKSLASH = String.fromCharCode(92);
/** JSON that is safe inside <script type="application/json">: no "<", no line separators. */
export const jsonForScript = (value) =>
  JSON.stringify(value)
    .replace(/</g, BACKSLASH + 'u003c')
    .replace(/\u{2028}/gu, BACKSLASH + 'u2028')
    .replace(/\u{2029}/gu, BACKSLASH + 'u2029');

const FONT_WEIGHTS = [['regular', 400], ['600', 600], ['700', 700]];

export function fontFaces(srcFor) {
  return FONT_WEIGHTS.map(([file, weight]) =>
    `@font-face{font-family:"Open Sans";font-style:normal;font-weight:${weight};font-display:swap;src:url("${srcFor(`open-sans-${file}.woff2`)}") format("woff2")}`).join('\n');
}

export function renderCalendarPage({ data, css, js, fonts }) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" href="data:,">
<title>${escapeHtml(data.title)}</title>
<style>
${fonts}
${css}
</style>
</head>
<body>
<main id="app" class="cal" aria-label="${escapeHtml(data.title)}">
<noscript><p>Der Kalender braucht JavaScript. Alle Termine stehen auch in <a href="events.json">events.json</a>.</p></noscript>
</main>
<script type="application/json" id="cal-data">${jsonForScript(data)}</script>
<script>
${js}
</script>
</body>
</html>
`;
}

export function renderListPage({ data, css, js, fonts }) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" href="data:,">
<title>Dienstabende</title>
<style>
${fonts}
${css}
</style>
</head>
<body>
<main id="app" aria-label="Dienstabende"><noscript><p>Die Termine brauchen JavaScript.</p></noscript></main>
<script type="application/json" id="list-data">${jsonForScript(data)}</script>
<script>
${js}
</script>
</body>
</html>
`;
}

export function renderEmbedPage({ title, css, fonts }) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Einbinden: ${escapeHtml(title)}</title>
<style>
${fonts}
${css}
body { max-width: 72rem; margin: 0 auto; padding: 2rem 1rem 4rem; }
h1 { color: var(--red); font-size: clamp(1.8rem, 1.2rem + 2.5vw, 2.6rem); line-height: 1.1; margin: 0 0 1rem; }
h2 { font-size: 1.35rem; margin: 2.5rem 0 0.75rem; }
p, li { max-width: 46rem; }
pre { background: var(--soft); border: 1px solid var(--line); border-radius: var(--radius); padding: 1rem; overflow-x: auto; font-size: 0.875rem; white-space: pre-wrap; word-break: break-all; }
.preview { display: grid; gap: 2rem; align-items: start; }
@media (min-width: 70rem) { .preview { grid-template-columns: minmax(0, 1fr) 390px; } }
.frame-label { font-weight: 700; margin: 0 0 0.5rem; }
iframe { display: block; width: 100%; border: 1px solid var(--line); border-radius: var(--radius); background: #fff; }
.phone iframe { width: 390px; max-width: 100%; }
.da-form { display: flex; flex-wrap: wrap; gap: 0.75rem 1.5rem; margin: 1rem 0; }
.da-form label { display: grid; gap: 0.25rem; font-weight: 600; font-size: 0.9rem; }
.da-form select, .da-form input { font: inherit; font-weight: 400; padding: 0.4rem 0.6rem; border: 1px solid var(--line); border-radius: 0.5rem; min-width: 12rem; }
code { font-size: 0.9em; background: var(--soft); padding: 0.1em 0.3em; border-radius: 0.25em; }
</style>
</head>
<body>
<h1>Kalender einbinden</h1>
<p>Der Kalender ist eine eigene Seite und wird per iframe in die Vereinsseite eingesetzt. Im DRK-CMS dafür ein HTML-Element anlegen und diesen Code einfügen:</p>
<pre id="snippet"></pre>
<p>Die zweite Zeile ist optional: Sie passt die Höhe des iframes an den Inhalt an. Wenn das CMS keine Skripte erlaubt, reicht das iframe allein, dann scrollt der Kalender bei Bedarf in sich.</p>
<h2>Vorschau</h2>
<div class="preview">
  <div><p class="frame-label">Breite Spalte</p><iframe data-drk-kalender title="${escapeHtml(title)}" style="height:900px"></iframe></div>
  <div class="phone"><p class="frame-label">Smartphone (390 Pixel)</p><iframe data-drk-kalender title="${escapeHtml(title)}, schmale Ansicht" style="height:900px"></iframe></div>
</div>
<h2>Dienstabende</h2>
<p>Die Liste der Dienstabende wie im TYPO3-Plugin, unter <code>dienstabende/</code>. Gesteuert wird sie über Parameter in der Adresse:</p>
<ul>
  <li><code>darstellung</code>: <code>liste</code> (Standard), <code>monate</code> oder <code>naechster</code> (nur der nächste Termin als Hinweis)</li>
  <li><code>anzahl</code>: höchstens so viele Termine, <code>0</code> = alle (Standard 5)</li>
  <li><code>mehr</code>: Adresse für den Knopf „Alle Termine ansehen“ (optional)</li>
</ul>
<form id="da-form" class="da-form">
  <label>Darstellung <select name="darstellung"><option value="liste">Aufklappbare Liste</option><option value="monate">Liste nach Monaten</option><option value="naechster">Nur der nächste Termin</option></select></label>
  <label>Anzahl <input name="anzahl" type="number" min="0" value="5"></label>
  <label>Knopf verlinkt auf <input name="mehr" type="url" placeholder="https://www.drk-uelzen.de/…"></label>
</form>
<pre id="da-snippet"></pre>
<iframe id="da-preview" data-drk-kalender title="Dienstabende" style="height:600px;max-width:52rem"></iframe>
<p>Die Termindaten gibt es auch als <a href="dienstabende.json">dienstabende.json</a> im Format, das das TYPO3-Plugin liest.</p>
<script>
(function () {
  var base = location.href.replace(/[#?].*$/, '').replace(/einbetten[.]html$/, '');
  var nl = String.fromCharCode(10);
  var form = document.getElementById('da-form');
  function updateList() {
    var params = new URLSearchParams();
    var d = form.darstellung.value, a = form.anzahl.value, m = form.mehr.value.trim();
    if (d !== 'liste') params.set('darstellung', d);
    if (a !== '' && a !== '5') params.set('anzahl', a);
    if (m) params.set('mehr', m);
    var qs = params.toString();
    var src = base + 'dienstabende/' + (qs ? '?' + qs : '');
    document.getElementById('da-preview').src = src;
    document.getElementById('da-snippet').textContent =
      '<iframe src="' + src + '" title="Dienstabende" loading="lazy" data-drk-kalender' + nl +
      '        style="display:block;width:100%;height:600px;border:0"></iframe>' + nl +
      '<script src="' + base + 'embed.js" async></' + 'script>';
  }
  form.addEventListener('input', updateList);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  updateList();
})();
</script>
<script>
(function () {
  var base = location.href.replace(/[#?].*$/, '').replace(/einbetten[.]html$/, '');
  var nl = String.fromCharCode(10);
  document.getElementById('snippet').textContent =
    '<iframe src="' + base + '" title="${escapeHtml(title)}" loading="lazy" data-drk-kalender' + nl +
    '        style="display:block;width:100%;height:900px;border:0"></iframe>' + nl +
    '<script src="' + base + 'embed.js" async></' + 'script>';
  var frames = document.querySelectorAll('iframe[data-drk-kalender]');
  for (var i = 0; i < frames.length; i++) frames[i].src = base;
})();
</script>
<script src="embed.js"></script>
</body>
</html>
`;
}
