// 인터넷이 약한 곳에서도 열리게 앱 파일을 캐시한다.
// 앱 파일을 바꿨는데 폰에 반영이 안 되면 CACHE 버전을 올린다.
// 같은 도메인의 다른 앱 캐시를 지우지 않도록 자기 접두어(jp-check-)로 시작하는 옛 캐시만 정리한다.
const CACHE = 'jp-check-v8';
const BASE = new URL('./', location).pathname;
const SHELL = ['./', 'app.js', 'style.css', 'common/base.css', 'common/theme.css', 'common/bag.js', 'common/ui.js', 'data.json', 'manifest.webmanifest', 'icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('jp-check-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.startsWith(BASE)) e.respondWith(networkFirst(req));
  else if (/(^|\.)(jsdelivr\.net|googleapis\.com|gstatic\.com)$/.test(url.hostname)) e.respondWith(cacheFirst(req));
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
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  try {
    const net = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      // 서버 재시작 중 502 같은 오류면 캐시된 것을 보여 준다
      return !res.ok && hit ? hit : res;
    });
    return await (hit ? Promise.race([net, new Promise((_, rej) => setTimeout(rej, 3000))]) : net);
  } catch {
    return hit ?? (await cache.match('./')) ?? Response.error();
  }
}
