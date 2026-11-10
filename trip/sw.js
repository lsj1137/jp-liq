// 메인(/)을 인터넷 없이도 열리게 한다. 홈 화면 앱이 메인에서 시작하므로 꼭 필요하다.
// 파일은 /trip/ 에 있지만 메인 주소가 / 라서 범위를 / 로 등록한다(server.js 가 Service-Worker-Allowed 헤더를 붙임).
// 각 메뉴 앱(/shop/ 등)은 자기 서비스 워커가 따로 있어서, 여기서는 메인이 쓰는 파일만 다루고 나머지는 건드리지 않는다.
const CACHE = 'jp-trip-v1';
const SHELL = [
  '/',
  '/trip/icon.svg',
  '/trip/map-icon.svg',
  '/trip/manifest.webmanifest',
  '/trip/icon-192.png',
  '/common/ui.js',
  '/shop/icon.svg',
  '/liquor/icon.svg',
  '/talk/icon.svg',
  '/check/icon.svg',
  '/money/icon.svg',
  '/kansai/icon.svg',
];
const OWN = new Set(SHELL);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('jp-trip-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname === '/' || url.pathname === '/trip/' || url.pathname === '/trip/index.html') e.respondWith(networkFirst(req, '/'));
    else if (OWN.has(url.pathname)) e.respondWith(networkFirst(req, url.pathname));
  } else if (/(^|\.)(jsdelivr\.net|googleapis\.com|gstatic\.com)$/.test(url.hostname)) e.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

// 최신을 받되, 캐시가 있으면 3초까지만 기다리고 캐시로 보여준다
async function networkFirst(req, key) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key);
  try {
    const net = fetch(req).then((res) => {
      if (res.ok) cache.put(key, res.clone());
      return !res.ok && hit ? hit : res;
    });
    return await (hit ? Promise.race([net, new Promise((_, rej) => setTimeout(rej, 3000))]) : net);
  } catch {
    return hit ?? Response.error();
  }
}
