/**
 * Serves the assembled demo page over HTTP.
 *
 * The page loads an ES module, so it cannot be opened from file://. This server
 * backs both local preview and the end-to-end suite, which therefore exercises
 * the artifact exactly as GitHub Pages serves it.
 */

import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname, extname, join, normalize, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const port = Number(process.env.DEMO_PORT ?? 4173);

const CONTENT_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
};

createServer(async (request, response) => {
    const pathname = normalize(new URL(request.url ?? '/', 'http://localhost').pathname);
    const file = join(root, pathname.endsWith('/') ? `${pathname}index.html` : pathname);

    if (!file.startsWith(root)) {
        response.writeHead(403).end('forbidden');
        return;
    }

    try {
        const body = await readFile(file);
        response.writeHead(200, {
            'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
            'cache-control': 'no-store',
        });
        response.end(body);
    } catch {
        response.writeHead(404).end('not found');
    }
}).listen(port, () => {
    process.stdout.write(`Serving ${root} on http://127.0.0.1:${port}/\n`);
});
