// Minimal static file server for local preview, tests and screenshots.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.ics': 'text/calendar; charset=utf-8', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

/** Serves dir on 127.0.0.1. Paths with a query also match files saved as "name?query" (wget mirrors). */
export function startStaticServer(dir, { port = 0, onRequest, transform } = {}) {
  const base = resolve(dir);
  const server = createServer(async (req, res) => {
    onRequest?.(req);
    const url = new URL(req.url, 'http://x');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const candidates = [rel];
    if (url.search) candidates.unshift(rel + url.search, rel + url.search + extname(rel));
    for (const c of candidates) {
      const file = normalize(join(base, c));
      if (file !== base && !file.startsWith(base + sep)) break;
      try {
        if (!(await stat(file)).isFile()) continue;
        const ext = extname(c.replace(/[?].*$/, '')) || extname(file);
        res.writeHead(200, { 'Content-Type': TYPES[ext.toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
        const body = await readFile(file);
        res.end(transform ? await transform(url.pathname, body) : body);
        return;
      } catch { /* next candidate */ }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('nicht gefunden');
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) })));
}
