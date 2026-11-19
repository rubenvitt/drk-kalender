// Öffnet die echte Seite drk-uelzen.de in einem eigenen Chrome-Fenster und setzt dort den
// lokal laufenden Kalender ein (nur in diesem Fenster, an der Website ändert sich nichts).
// Voraussetzung: npm run demo läuft (Kalender auf :4810).
// Aufruf: node scripts/live-demo.js [Seiten-URL]
import puppeteer from 'puppeteer-core';
import { readFile } from 'node:fs/promises';

const PAGE = process.argv[2] ?? 'https://www.drk-uelzen.de/angebote/bereitschaft/bereitschaft-kreis-uelzen.html';
const CAL = process.env.CAL_URL ?? `http://127.0.0.1:${process.env.DEMO_PORT ?? 4810}/`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const embedJs = await readFile('dist/embed.js', 'utf8');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: null, args: ['--window-size=1440,1000'] });
const [page] = await browser.pages();
await page.goto(PAGE, { waitUntil: 'networkidle2' });
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Alles klar|Akzeptieren|Alle akzeptieren/i.test(b.textContent))?.click());
const where = await page.evaluate((src, embedJs) => {
  const main = document.querySelector('main') ?? document.body;
  const frames = [...main.querySelectorAll(':scope .frame')];
  const anchor = frames.find((f) => /textmedia/.test(f.className) && f.textContent.trim().length > 80) ?? frames[0];
  const header = document.createElement('div');
  header.className = 'frame frame-type-header frame-layout-0';
  const hd = document.createElement('header');
  hd.className = 'header';
  const h2 = document.createElement('h2');
  h2.className = 'header__header';
  h2.textContent = 'Termine';
  hd.append(h2);
  header.append(hd);
  const wrap = document.createElement('div');
  wrap.className = 'frame gridelements__wrapper frame-type-container_page_layout_100';
  const body = document.createElement('div');
  body.className = 'gridelements__body';
  body.style.cssText = 'width:min(80rem, 100% - 2.5rem);max-width:none';
  const iframe = document.createElement('iframe');
  Object.assign(iframe, { src, title: 'Termine im DRK-Kreisverband Uelzen' });
  iframe.setAttribute('data-drk-kalender', '');
  iframe.style.cssText = 'display:block;width:100%;height:900px;border:0';
  body.append(iframe);
  wrap.append(body);
  anchor.after(header, wrap);
  const s = document.createElement('script');
  s.textContent = embedJs;
  document.body.append(s);
  header.scrollIntoView({ behavior: 'instant', block: 'start' });
  return anchor.id || anchor.className;
}, CAL, embedJs);
console.log(`Kalender eingesetzt nach ${where} auf ${PAGE}. Fenster schließen zum Beenden.`);
await new Promise((r) => browser.on('disconnected', r));
