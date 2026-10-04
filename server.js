const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadRepository } = require('./lib/repository');

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.resolve(__dirname, 'public');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function send(res, status, body, type) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function publicFile(pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, relative);
  if (file !== PUBLIC_DIR && !file.startsWith(`${PUBLIC_DIR}${path.sep}`)) return null;
  return file;
}

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    if (url.pathname === '/api/history') {
      try {
        send(res, 200, JSON.stringify(loadRepository(process.cwd())), 'application/json; charset=utf-8');
      } catch (error) {
        send(res, 500, JSON.stringify({ error: error.message }), 'application/json; charset=utf-8');
      }
      return;
    }

    const file = publicFile(url.pathname);
    if (!file) {
      send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
      return;
    }
    fs.readFile(file, (error, body) => {
      if (error) {
        send(res, 404, 'Not found', 'text/plain; charset=utf-8');
        return;
      }
      send(res, 200, body, TYPES[path.extname(file)] || 'application/octet-stream');
    });
  });
}

if (require.main === module) {
  createServer().listen(PORT, HOST, () => {
    console.log(`Git Gantt listening on http://127.0.0.1:${PORT}`);
  });
}

module.exports = { createServer };
