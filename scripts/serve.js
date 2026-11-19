// Lokale Vorschau: node scripts/serve.js [verzeichnis] [port]
import { startStaticServer } from './static-server.js';
const [dir = 'dist', port = '8080'] = process.argv.slice(2);
const { url } = await startStaticServer(dir, { port: Number(port) });
console.log(`Vorschau: ${url}  (Einbetten: ${url}einbetten.html)`);
