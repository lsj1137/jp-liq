// 앱 서버. 정적 파일과 API(api/)를 함께 서빙한다. 배포 서버에서는 nginx 뒤에서 pm2로 실행.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import identify from './api/identify.js';
import rate from './api/rate.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
// 기본은 로컬에서만 접속 가능. 같은 와이파이의 폰으로 테스트하려면 HOST=0.0.0.0
const HOST = process.env.HOST || '127.0.0.1';
const API = { '/api/identify': identify, '/api/rate': rate };

// URL 앞부분 → 정적 파일 폴더 (위에서부터 먼저 맞는 것)
// nginx(jp-trip.conf): / 는 /trip/ 으로, /liquor/ 는 앞부분을 떼고(→ 아래의 '/'), 나머지는 그대로 넘겨준다.
// 새 메뉴는 폴더를 만들고 APPS 에 이름만 추가하면 된다 (nginx 수정 불필요).
// common/ 은 모든 앱이 같이 쓰는 디자인(theme.css)이라 각 앱 아래 /<앱>/common/ 으로도 연결한다.
const APPS = ['trip', 'shop', 'kansai', 'talk', 'check', 'money'];
const MOUNTS = [
  ...APPS.flatMap((app) => [
    [`/${app}/common/`, here('./common/')],
    [`/${app}/`, here(`./${app}/`)],
  ]),
  ['/common/', here('./common/')],
  ['/', here('./liquor/')],
].map(([prefix, dir]) => [prefix, resolve(dir) + sep]);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
};

// 요청 하나에서 난 예상 못 한 오류가 서버 전체를 끄지 않게 한다
const safe = (handler) => (req, res) =>
  handler(req, res).catch((e) => {
    console.error(e);
    if (!res.headersSent) res.writeHead(500).end();
  });

http
  .createServer(safe(async (req, res) => {
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

    // /shop 처럼 끝에 / 가 없으면 붙여서 보낸다 (상대 경로가 맞게 풀리도록)
    const bare = MOUNTS.find(([prefix]) => prefix !== '/' && pathname === prefix.slice(0, -1));
    if (bare) return res.writeHead(301, { location: bare[0] }).end();

    const [prefix, root] = MOUNTS.find(([p]) => pathname.startsWith(p));
    let rel;
    try {
      rel = decodeURIComponent(pathname.slice(prefix.length));
    } catch {
      return res.writeHead(400).end('Bad request');
    }
    const file = normalize(join(root, rel === '' || rel.endsWith('/') ? rel + 'index.html' : rel));
    if (!file.startsWith(root)) return res.writeHead(403).end();
    try {
      const data = await readFile(file);
      res.writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        // 병 사진은 거의 안 바뀌니 오래 캐시, 나머지는 매번 새로 확인
        'cache-control': pathname.startsWith('/img/') ? 'public, max-age=604800' : 'no-cache',
        // 메인 서비스 워커는 /trip/ 에 있지만 메인 주소(/) 전체를 맡는다
        ...(pathname === '/trip/sw.js' && { 'service-worker-allowed': '/' }),
      }).end(data);
    } catch {
      res.writeHead(404).end('Not found');
    }
  }))
  .listen(PORT, HOST, () => {
    console.log(`jp-trip: http://${HOST}:${PORT}  (/ 술, ${APPS.map((a) => `/${a}/`).join(' ')})`);
    if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) console.log('  (GEMINI_API_KEY / ANTHROPIC_API_KEY 없음 → 사진 인식 비활성)');
  });
