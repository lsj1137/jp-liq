// 메인 화면의 일본 지역 선택 지도(SVG)를 만든다.
// 도도부현 경계(dataofjapan/land, japan.geojson)를 9개 지방으로 묶고, 해안선을 단순화하고,
// 작은 섬은 빼고, 오키나와는 왼쪽 위 작은 상자로 옮긴다.
// 결과는 trip/index.html 의 <!-- japan-map --> 사이에 그대로 넣는다.
// 사용: node scripts/build-japan-map.mjs [japan.geojson 경로]
import { readFile, writeFile } from 'node:fs/promises';

const SRC = 'https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson';
const HTML = new URL('../trip/index.html', import.meta.url);

// 도도부현 코드(JIS) → 지방
const REGION_OF = (id) =>
  id === 1 ? 'hokkaido'
  : id <= 7 ? 'tohoku'
  : id <= 14 ? 'kanto'
  : id <= 23 ? 'chubu'
  : id <= 30 ? 'kansai'
  : id <= 35 ? 'chugoku'
  : id <= 39 ? 'shikoku'
  : id <= 46 ? 'kyushu'
  : 'okinawa';

// 지도 위 이름표: 크게 대표 도시, 작게 지방 이름. dx/dy는 지방 중심에서 이름표를 옮길 거리(바다 쪽으로 빼면 선을 긋는다)
const LABELS = {
  hokkaido: { city: '삿포로', name: '홋카이도', dx: 0, dy: 4 },
  tohoku: { city: '센다이', name: '도호쿠', dx: 4, dy: 0 },
  kanto: { city: '도쿄', name: '간토', dx: 58, dy: 22 },
  chubu: { city: '나고야', name: '주부', dx: -2, dy: -6 },
  kansai: { city: '오사카·교토', name: '간사이', dx: 74, dy: 46 },
  chugoku: { city: '히로시마', name: '주고쿠', dx: -6, dy: -34 },
  shikoku: { city: '마쓰야마', name: '시코쿠', dx: -4, dy: 38 },
  kyushu: { city: '후쿠오카', name: '규슈', dx: -8, dy: -30 },
  okinawa: { city: '오키나와', name: '나하', dx: 0, dy: 34 },
};

const LAT0 = 45.8; // 지도 위쪽 위도
const LON0 = 128.4; // 지도 왼쪽 경도
const K = 24.5; // 1도당 픽셀
const COS = Math.cos((36 * Math.PI) / 180);
const proj = ([lon, lat]) => [(lon - LON0) * COS * K, (LAT0 - lat) * K];

// 오키나와 본섬 주변을 왼쪽 위 상자(OKI_BOX)로 옮긴다
const OKI_BOX = { x: 8, y: 8, w: 92, h: 92 };
const OKI_SRC = { lon: [126.6, 128.4], lat: [25.9, 27.0] };

const area = (r) => Math.abs(r.reduce((a, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return a + x * y2 - x2 * y; }, 0) / 2);
// 닫힌 고리는 시작점=끝점이라 그대로 줄이면 전부 사라진다. 시작점에서 가장 먼 점으로 둘로 나눠 각각 줄인다.
function simplifyRing(ring, tol) {
  const pts = ring.slice(0, -1);
  if (pts.length < 4) return pts;
  let far = 0;
  for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]) > Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])) far = i;
  return [...simplify(pts.slice(0, far + 1), tol), ...simplify([...pts.slice(far), pts[0]], tol).slice(1, -1)];
}
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [x1, y1] = pts[a], [x2, y2] = pts[b];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((x2 - x1) * (y1 - pts[i][1]) - (x1 - pts[i][0]) * (y2 - y1)) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const geo = JSON.parse(process.argv[2] ? await readFile(process.argv[2], 'utf8') : await (await fetch(SRC)).text());
const regions = {};
for (const f of geo.features) {
  const id = f.properties.id;
  const region = REGION_OF(id);
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    const ring = poly[0]; // 바깥 테두리만 (호수 구멍은 무시)
    const lons = ring.map((p) => p[0]), lats = ring.map((p) => p[1]);
    const clon = (Math.min(...lons) + Math.max(...lons)) / 2, clat = (Math.min(...lats) + Math.max(...lats)) / 2;
    let pts;
    if (region === 'okinawa') {
      // 본섬 주변만 남기고 상자 안으로
      if (clon < OKI_SRC.lon[0] || clon > OKI_SRC.lon[1] || clat < OKI_SRC.lat[0] || clat > OKI_SRC.lat[1]) continue;
      const sx = OKI_BOX.w / ((OKI_SRC.lon[1] - OKI_SRC.lon[0]) * COS), sy = OKI_BOX.h / (OKI_SRC.lat[1] - OKI_SRC.lat[0]);
      const s = Math.min(sx, sy) * 0.92;
      pts = ring.map(([lon, lat]) => [OKI_BOX.x + 6 + (lon - OKI_SRC.lon[0]) * COS * s, OKI_BOX.y + 4 + (OKI_SRC.lat[1] - lat) * s]);
    } else {
      // 오가사와라·이즈 제도, 아마미 제도처럼 멀리 떨어진 섬은 뺀다
      if (clat < 30.9) continue;
      if (id === 13 && clat < 34.6) continue;
      // 홋카이도 동쪽 끝 너머의 섬(쿠릴 열도)은 지도를 옆으로 넓히기만 해서 뺀다
      if (id === 1 && clon > 145.6) continue;
      pts = ring.map(proj);
    }
    pts = simplifyRing(pts, 0.55);
    if (pts.length < 4 || area(pts) < (region === 'okinawa' ? 6 : 3)) continue;
    (regions[region] ??= []).push(pts);
  }
}

const fmt = (n) => Math.round(n * 10) / 10;
const pathOf = (rings) => rings.map((r) => 'M' + r.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L') + 'Z').join('');
const W = Math.ceil(Math.max(...Object.values(regions).flat(2).map((p) => p[0]))) + 8;
const H = Math.ceil(Math.max(...Object.values(regions).flat(2).map((p) => p[1]))) + 8;

let svg = `<svg class="jmap" viewBox="0 0 ${W} ${H}" role="group" aria-label="일본 지역 지도">`;
svg += `<rect class="oki-box" x="${OKI_BOX.x}" y="${OKI_BOX.y}" width="${OKI_BOX.w}" height="${OKI_BOX.h + 30}" rx="8" />`;
// 땅을 먼저 다 그리고 이름표는 그 위에 따로 그린다 (다른 지방 땅·선에 가리지 않게).
// 같은 지방의 땅과 이름표는 둘 다 data-r 이 같아서 어느 쪽을 눌러도 그 지방이 골라진다.
let labels = '';
for (const [region, rings] of Object.entries(regions)) {
  // 이름표 위치: 가장 큰 섬의 중심 + 지정한 만큼 이동
  const main = rings.reduce((a, b) => (area(b) > area(a) ? b : a));
  const xs = main.map((p) => p[0]), ys = main.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const L = LABELS[region];
  const lx = cx + L.dx, ly = cy + L.dy;
  const far = Math.hypot(L.dx, L.dy) > 26;
  svg += `<g class="rg" data-r="${region}" tabindex="0" role="button" aria-label="${L.name} (${L.city})"><path d="${pathOf(rings)}" /></g>`;
  labels += `<g class="rg lbl" data-r="${region}">`;
  if (far) labels += `<line x1="${fmt(cx)}" y1="${fmt(cy)}" x2="${fmt(lx)}" y2="${fmt(ly - 13)}" />`;
  labels += `<text x="${fmt(lx)}" y="${fmt(ly)}" class="city">${L.city}</text><text x="${fmt(lx)}" y="${fmt(ly + 15)}" class="name">${L.name}</text></g>`;
}
svg += labels;
svg += `</svg>`;

const html = await readFile(HTML, 'utf8');
const out = html.replace(/<!-- japan-map -->[\s\S]*?<!-- \/japan-map -->/, `<!-- japan-map -->${svg}<!-- /japan-map -->`);
if (out === html) throw new Error('trip/index.html 에 <!-- japan-map --><!-- /japan-map --> 자리가 없어요');
await writeFile(HTML, out);
console.log(`지도 ${W}x${H}, ${(svg.length / 1024).toFixed(1)}KB, 지방 ${Object.keys(regions).length}개`);
