// Minimal static server for tests — serves the repo root.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.css': 'text/css',
};

// Serve ONLY under the GitHub Pages project base (/pullup-coach/), so tests
// exercise the same path depth as production and a path that escapes the base
// (e.g. a stray ../) 404s here exactly as it would on Pages.
const BASE = '/pullup-coach/';
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/pullup-coach') p = BASE;
  if (p.indexOf(BASE) !== 0) { res.writeHead(404); res.end('not found (outside project base)'); return; }
  p = p.slice(BASE.length - 1); // strip base, keep leading slash
  if (p === '/' || p === '') p = '/index.html';
  // Directory URLs (e.g. /coach/) resolve to their index.html, matching how
  // GitHub Pages serves a directory. This lets the coach app run at /coach/.
  else if (p.charAt(p.length - 1) === '/') p += 'index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(8791, '127.0.0.1');
