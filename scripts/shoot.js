// Screenshots für README und zum Verschicken: der Kalender allein und eingebettet in die
// gespiegelte Bereitschaftsseite von drk-uelzen.de (Mirror aus dem Repo drk-dienstkalender-mockups).
// Aufruf: npm run build && node scripts/shoot.js
//   MIRROR_DIR  Pfad zum Mirror (Standard: ../dienstkalender-mockups/mirror/www.drk-uelzen.de)
//   CHROME      Pfad zu Chrome (Standard: macOS-Installationspfad)

import { mkdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { startStaticServer } from './static-server.js';

const OUT = resolve('docs/screenshots');
const MIRROR = resolve(process.env.MIRROR_DIR ?? '../dienstkalender-mockups/mirror/www.drk-uelzen.de');
const PAGE = 'angebote/bereitschaft/bereitschaft-kreis-uelzen.html';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const data = JSON.parse(await readFile('dist/events.json', 'utf8'));
const today = data.generatedAt.slice(0, 10);
// Beispieltermin mit Beschreibung und Anmeldung, möglichst nah an heute
const sample = data.events.find((e) => e.startDate >= today && e.registration && e.description) ?? data.events[0];

await mkdir(OUT, { recursive: true });
const errors = [];
const cal = await startStaticServer('dist');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

async function open(url, viewport) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
  await page.setViewport(viewport);
  await page.goto(url, { waitUntil: 'networkidle0' });
  return page;
}

// 1) Kalender allein
{
  const page = await open(`${cal.url}#termin/${sample.id}`, { width: 1280, height: 1000, deviceScaleFactor: 1 });
  await page.screenshot({ path: `${OUT}/kalender-desktop.png`, fullPage: true });
  await page.close();
}
{
  const page = await open(cal.url, { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.click(`[data-fk="d-${sample.days[0]}"]`);
  await page.click(`#termin-${sample.id} summary`);
  await page.screenshot({ path: `${OUT}/kalender-mobil.png`, fullPage: true });
  await page.close();
}

// 2) Eingebettet in die Bereitschaftsseite (zweiter Server = andere Origin, wie live)
const hasMirror = await stat(`${MIRROR}/${PAGE}`).then(() => true, () => false);
if (!hasMirror) {
  console.log(`Kein Mirror unter ${MIRROR}, eingebettete Ansicht übersprungen.`);
} else {
  const host = await startStaticServer(MIRROR);
  const embedJs = await readFile('dist/embed.js', 'utf8');
  for (const [name, viewport] of [
    ['eingebettet-desktop', { width: 1440, height: 900, deviceScaleFactor: 1 }],
    ['eingebettet-mobil', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ]) {
    const page = await open(host.url + PAGE, viewport);
    const clip = await page.evaluate(async ({ src, embedJs }) => {
      document.querySelectorAll('#cc-main, .cc-window, [class*="cookie"]').forEach((el) => el.remove());
      const anchor = document.querySelector('#c7078') ?? document.querySelector('main .frame');
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="frame frame-type-header frame-layout-0"><header class="header"><h2 class="header__header">Termine</h2></header></div>
        <div class="frame gridelements__wrapper frame-type-container_page_layout_100"><div class="gridelements__body" style="width:min(80rem, 100% - 2.5rem);max-width:none">
        <iframe src="${src}" title="Termine im DRK-Kreisverband Uelzen" data-drk-kalender style="display:block;width:100%;height:900px;border:0"></iframe>
        </div></div>`;
      anchor.after(...wrap.children);
      const s = document.createElement('script');
      s.textContent = embedJs;
      document.body.append(s);
      const frame = document.querySelector('iframe[data-drk-kalender]');
      for (let i = 0; i < 100 && frame.style.height === '900px'; i++) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 300));
      const top = document.querySelector('#c3460')?.getBoundingClientRect().top ?? 0;
      const bottom = frame.getBoundingClientRect().bottom;
      return { x: 0, y: Math.max(0, top + scrollY - 24), width: document.documentElement.clientWidth, height: bottom - top + 64, resized: frame.style.height };
    }, { src: cal.url, embedJs });
    if (clip.resized === '900px') errors.push(`${name}: iframe-Höhe wurde nicht angepasst`);
    const { resized, ...box } = clip;
    // Cross-origin iframes are only painted inside the viewport: make it as tall as the page.
    await page.setViewport({ ...viewport, height: Math.ceil(box.y + box.height + 10) });
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: `${OUT}/${name}.png`, clip: box });
    console.log(`${name}: iframe-Höhe ${resized}`);
    await page.close();
  }
  await host.close();
}

await browser.close();
await cal.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Screenshots in ${OUT} (Beispieltermin: ${sample.title}, ${sample.dateLabel})`);
