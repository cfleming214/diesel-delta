// Serves the exported web build with single-page-app fallback (every unknown path gets index.html).
// Text assets are compressed (brotli, else gzip) like a production host, so load-time measurements
// against this server are realistic.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const root = process.argv[2] ?? 'dist-e2e';
const port = Number(process.env.E2E_WEB_PORT ?? 8091);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.ttf']);

/** Compressed bodies, built once per file and encoding. */
const cache = new Map();
function body(file, encoding) {
  const k = `${encoding}:${file}`;
  if (!cache.has(k)) {
    const raw = readFileSync(file);
    cache.set(
      k,
      encoding === 'br'
        ? brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } })
        : encoding === 'gzip'
          ? gzipSync(raw, { level: 6 })
          : raw,
    );
  }
  return cache.get(k);
}

// Compress every text asset up front so the first request isn't slowed by compression.
function warm(dir) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) warm(file);
    else if (COMPRESSIBLE.has(extname(file))) for (const e of ['br', 'gzip']) body(file, e);
  }
}
if (existsSync(root)) warm(root);

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
  let file = join(root, path);
  if (!file.startsWith(normalize(root)) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, 'index.html');
  }
  const ext = extname(file);
  const accept = String(req.headers['accept-encoding'] ?? '');
  const encoding = !COMPRESSIBLE.has(ext)
    ? null
    : /\bbr\b/.test(accept)
      ? 'br'
      : /\bgzip\b/.test(accept)
        ? 'gzip'
        : null;
  res.writeHead(200, {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    vary: 'accept-encoding',
    ...(encoding ? { 'content-encoding': encoding } : {}),
  });
  res.end(body(file, encoding ?? 'identity'));
}).listen(port, () => console.log(`web build on http://localhost:${port}`));
