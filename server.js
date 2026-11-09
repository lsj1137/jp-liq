// 앱 서버. 정적 파일(public/)과 API(api/)를 함께 서빙한다. 배포 서버에서는 nginx 뒤에서 pm2로 실행.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import identify from './api/identify.js';
import rate from './api/rate.js';

const PUBLIC = fileURLToPath(new URL('./public/', import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
// 기본은 로컬에서만 접속 가능. 같은 와이파이의 폰으로 테스트하려면 HOST=0.0.0.0
const HOST = process.env.HOST || '127.0.0.1';
const API = { '/api/identify': identify, '/api/rate': rate };
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
};

http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const api = API[pathname];
    if (api) {
      try {
        await api(req, res);
      } catch (e) {
        console.error(e);
        if (!res.headersSent) res.writeHead(500).end('{"error":"서버 오류"}');
      }
      return;
    }

    const file = normalize(join(PUBLIC, pathname === '/' ? 'index.html' : decodeURIComponent(pathname)));
    if (!file.startsWith(PUBLIC)) return res.writeHead(403).end();
    try {
      const data = await readFile(file);
      res.writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        // 병 사진은 거의 안 바뀌니 오래 캐시, 나머지는 매번 새로 확인
        'cache-control': pathname.startsWith('/img/') ? 'public, max-age=604800' : 'no-cache',
      }).end(data);
    } catch {
      res.writeHead(404).end('Not found');
    }
  })
  .listen(PORT, HOST, () => {
    console.log(`jp-liq: http://${HOST}:${PORT}`);
    if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) console.log('  (GEMINI_API_KEY / ANTHROPIC_API_KEY 없음 → 사진 인식 비활성)');
  });
