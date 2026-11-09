// 지하 매장처럼 인터넷이 약한 곳에서도 목록·가격·병 사진이 열리게 캐시한다.
// 사진 인식(/api/identify, POST)만 인터넷이 필요하다.
// 병 사진을 같은 파일 이름으로 바꿨다면 CACHE 버전을 올려야 새 사진이 보인다.
const CACHE = 'jp-liq-v3';
const SHELL = ['/', '/app.js', '/style.css', '/whiskies.json', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
        .then(() => self.clients.claim()),
      precacheBottles(),
    ]),
  );
});

// 처음 한 번 모든 병 사진을 받아 둔다 (약 3MB). 실패한 건 다음에 볼 때 다시 받는다.
async function precacheBottles() {
  try {
    const cache = await caches.open(CACHE);
    const list = await (await fetch('/whiskies.json')).json();
    for (const w of list) {
      const url = `/img/${w.id}.webp`;
      if (await cache.match(url)) continue;
      const res = await fetch(url).catch(() => null);
      if (res?.ok) await cache.put(url, res);
    }
  } catch {
    // 오프라인이면 다음 기회에
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 병 사진과 글꼴은 거의 안 바뀌니 캐시 우선
  if (url.pathname.startsWith('/img/') || url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(cacheFirst(req));
  } else if (url.origin === location.origin) {
    e.respondWith(networkFirst(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

// 앱 파일·가격 데이터·환율: 최신을 받되, 캐시가 있으면 3초까지만 기다리고 캐시로 보여준다
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  try {
    const net = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    });
    return await (hit ? Promise.race([net, new Promise((_, rej) => setTimeout(rej, 3000))]) : net);
  } catch {
    return hit ?? (await cache.match('/')) ?? Response.error();
  }
}
