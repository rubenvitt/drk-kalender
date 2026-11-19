#!/usr/bin/env node
// Baut die statische Seite: node src/build.js [--config calendars.json] [--out dist] [--standalone] [--now ISO-Zeit]
//   --standalone  eine einzige HTML-Datei (Schriften und .ics eingebettet) zum Verschicken
//   --now         Zeitpunkt des Builds vorgeben (für reproduzierbare Beispiele)

import { mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadConfig } from './config.js';
import { buildData } from './data.js';
import { eventToIcs } from './ics-export.js';
import { fontFaces, renderCalendarPage, renderEmbedPage, renderListPage } from './render.js';
import { pluginJson, selectDienstabende } from './dienstabende.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'web');
const FONT_FILES = ['open-sans-regular.woff2', 'open-sans-600.woff2', 'open-sans-700.woff2'];

export async function buildSite({ configPath, outDir, standalone = false, now = Date.now(), env, fetchImpl, log = console.log, sourceOptions }) {
  const config = await loadConfig(configPath);
  const data = await buildData({ config, now, env, fetchImpl, sourceOptions });
  for (const w of data.warnings) log(`Warnung: ${w}`);
  const { warnings, ...pageData } = data;

  const [css, js, embedJs, listCss, listJs] = await Promise.all(
    ['styles.css', 'app.js', 'embed.js', 'list.css', 'list.js'].map((f) => readFile(join(WEB, f), 'utf8')));
  const dienstabende = config.dienstabende ? selectDienstabende(data, config.dienstabende, now) : null;
  const icsFor = (ev) => eventToIcs(ev, { now });

  await mkdir(outDir, { recursive: true });
  if (standalone) {
    const fontData = {};
    for (const f of FONT_FILES) fontData[f] = 'data:font/woff2;base64,' + (await readFile(join(WEB, 'fonts', f))).toString('base64');
    const events = pageData.events.map((ev) => ({ ...ev, ics: 'data:text/calendar;charset=utf-8,' + encodeURIComponent(icsFor(ev)) }));
    const file = join(outDir, 'drk-kalender.html');
    await writeFile(file, renderCalendarPage({ data: { ...pageData, events }, css, js, fonts: fontFaces((f) => fontData[f]) }));
    log(`${events.length} Termine -> ${file}`);
    return { data, files: [file] };
  }

  const fonts = fontFaces((f) => `fonts/${f}`);
  if (dienstabende) {
    await mkdir(join(outDir, 'dienstabende'), { recursive: true });
    const listData = { generatedAt: pageData.generatedAt, timeZone: pageData.timeZone, events: dienstabende };
    await Promise.all([
      writeFile(join(outDir, 'dienstabende', 'index.html'), renderListPage({ data: listData, css: listCss, js: listJs, fonts: fontFaces((f) => `../fonts/${f}`) })),
      writeFile(join(outDir, 'dienstabende.json'), JSON.stringify(pluginJson(dienstabende), null, 1)),
    ]);
    log(`${dienstabende.length} Dienstabende -> ${join(outDir, 'dienstabende')}`);
  }
  await rm(join(outDir, 'ics'), { recursive: true, force: true });
  await mkdir(join(outDir, 'ics'), { recursive: true });
  await mkdir(join(outDir, 'fonts'), { recursive: true });
  await Promise.all([
    writeFile(join(outDir, 'index.html'), renderCalendarPage({ data: pageData, css, js, fonts })),
    writeFile(join(outDir, 'einbetten.html'), renderEmbedPage({ title: pageData.title, css, fonts })),
    writeFile(join(outDir, 'embed.js'), embedJs),
    writeFile(join(outDir, 'events.json'), JSON.stringify(pageData, null, 1)),
    writeFile(join(outDir, '.nojekyll'), ''),
    ...pageData.events.map((ev) => writeFile(join(outDir, ev.ics), icsFor(ev))),
    ...FONT_FILES.map((f) => copyFile(join(WEB, 'fonts', f), join(outDir, 'fonts', f))),
  ]);
  log(`${pageData.events.length} Termine aus ${pageData.calendars.length} Kalendern -> ${outDir}`);
  return { data };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      config: { type: 'string', default: join(ROOT, 'calendars.json') },
      out: { type: 'string' },
      standalone: { type: 'boolean', default: false },
      now: { type: 'string' },
    },
  });
  const now = values.now ? Date.parse(values.now) : Date.now();
  if (Number.isNaN(now)) {
    console.error(`--now ist keine gültige Zeit: ${values.now}`);
    process.exit(2);
  }
  const outDir = resolve(values.out ?? (values.standalone ? 'standalone' : 'dist'));
  buildSite({ configPath: values.config, outDir, standalone: values.standalone, now }).catch((e) => {
    console.error(`Build abgebrochen. ${e.message}`);
    process.exit(1);
  });
}
