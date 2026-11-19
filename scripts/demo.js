// Klickbare Demo: Kalender auf :4810, die gespiegelte Bereitschaftsseite mit eingebettetem
// Kalender auf :4811 (zweite Origin, wie live). Aufruf: npm run build && npm run demo
// Andere Ports: DEMO_PORT=5000 npm run demo
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { startStaticServer } from './static-server.js';

const MIRROR = resolve(process.env.MIRROR_DIR ?? '../dienstkalender-mockups/mirror/www.drk-uelzen.de');
const PAGE = '/angebote/bereitschaft/bereitschaft-kreis-uelzen.html';

const PORT = Number(process.env.DEMO_PORT ?? 4810);
const cal = await startStaticServer('dist', { port: PORT });
const embedJs = await readFile('dist/embed.js', 'utf8');
const inject = `<script>
document.addEventListener('DOMContentLoaded', function () {
  var anchor = document.querySelector('#c7078') || document.querySelector('main .frame');
  var wrap = document.createElement('div');
  wrap.innerHTML = '<div class="frame frame-type-header frame-layout-0"><header class="header"><h2 class="header__header">Termine</h2></header></div>' +
    '<div class="frame gridelements__wrapper frame-type-container_page_layout_100"><div class="gridelements__body" style="width:min(80rem, 100% - 2.5rem);max-width:none">' +
    '<iframe src="${cal.url}" title="Termine im DRK-Kreisverband Uelzen" loading="lazy" data-drk-kalender style="display:block;width:100%;height:900px;border:0"></iframe></div></div>';
  anchor.after.apply(anchor, Array.from(wrap.children));
});
${embedJs}
</script>`;
const host = await startStaticServer(MIRROR, {
  port: PORT + 1,
  transform: (path, body) => (path === PAGE ? body.toString('utf8').replace('</body>', inject + '</body>') : body),
});
console.log(`Kalender allein:      ${cal.url}`);
console.log(`Einbettungsseite:     ${cal.url}einbetten.html`);
console.log(`Auf der DRK-Seite:    ${host.url}${PAGE.slice(1)}`);
