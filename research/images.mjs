// 데일리샷 검색 결과에서 병 사진을 찾아 public/img/<id>.webp 로 저장한다.
// 사용: node research/images.mjs [--force] [id ...]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const list = JSON.parse(readFileSync(new URL('../public/whiskies.json', import.meta.url), 'utf8'));
const out = new URL('../public/img/', import.meta.url);
mkdirSync(out, { recursive: true });

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

// 이름 비교용: 공백·기호 제거, '년'과 'yo'/'year' 차이 무시
const key = (s) => (s ?? '').toLowerCase().replace(/[\s\-'’.,()·]/g, '').replace(/년|yearsold|yearold|years|year|yo\b/g, '');
const SKIP = /잔세트|세트|미니|50ml|200ml|375ml|1l|1000ml|1\.75|기프트|선물|giftbox|케이스|패키지|전용잔|에디션|스탬프|\[/i;
// 검색어가 애매한 제품은 직접 지정
const QUERY = {
  toki: '산토리 토키',
  'yoichi-nv': '닛카 요이치 싱글몰트',
  'nikka-coffey-grain': '닛카 코페이 그레인',
  'jw-black': '조니워커 블랙 라벨 12년',
  blantons: '블랑톤 오리지널 싱글배럴',
  'jack-daniels': '잭다니엘 올드 넘버7',
  'woodford-reserve': '우드포드 리저브 버번',
};

// 자동 매칭이 틀리는 제품: [검색어, 데일리샷 상품명(정확히 일치)]
const PIN = {
  'dom-perignon-vintage': ['돔페리뇽', '돔 페리뇽 2015'],
  'opus-one': ['오퍼스원', '오퍼스 원 2022'],
  'chateau-margaux': ['샤또 마고', '샤또 마고 2022'],
  'penfolds-bin-389': ['펜폴즈 389', '[2022vin 5대샤또를 넘어라. 도심속 빈야드 호주의 문화재여] 펜폴즈 빈 389 까베르네 쉬라즈'],
  'chateau-lagrange': ['라그랑주', '샤또 라그랑쥬 2017'],
  tignanello: ['티냐넬로', '티냐넬로 2022'],
  'caymus-napa-cabernet': ['케이머스 까베르네', '케이머스 나파 밸리 까베르네 소비뇽'],
  'choya-single-year': ['초야 싱글이어', '쵸야 우메슈'],
  'dassai-23': ['닷사이 23', '닷사이 준마이 다이긴죠 23'],
  'dassai-39': ['닷사이 39', '닷사이 준마이 다이긴죠 39'],
  mao: ['마오 소주', '마오우 마왕 메이몬노이키 고구마 소주'],
  'iichiko-silhouette': ['이이치코 실루엣', '이이치코 실루엣'],
  'tatenokawa-seiryu': ['타테노카와 세이류', '타테노카와 준마이 다이긴죠 세이류'],
  'kuro-kirishima': ['쿠로키리시마', '구로 기리시마 900ml'],
  'koshino-kanbai-shiro': ['코시노칸바이', '코시노칸바이 시로라벨 720ml'],
  'suntory-sui-gin': ['수이 진', '산토리 수이 진'],
  'zanpa-black': ['잔파', '[주문 시 시일이 걸릴 수 있습니다.] 잔파 블랙 아와모리'],
  'juyondai-honmaru': ['쥬욘다이', '쥬욘다이 혼마루 1800ml'],
  'mio-sparkling': ['미오 스파클링', '미오 스파클링 300ml'],
  'satsuma-shiranami': ['사츠마 시라나미', '사츠마 시라나미 900ml'],
  'laphroaig-10': ['라프로익 10년', '라프로익 10년 43% 750ml'],
  'jack-daniels': ['잭다니엘 넘버7', '잭 다니엘스'],
  'jw-black': ['블랙라벨 조니워커', '조니워커 블랙 700ml'],
  'makers-mark': ['메이커스 마크', '메이커스 마크 700ml'],
  'blantons-gold': ['블랑톤 골드', '블랑톤 골드 에디션 700ml'],
  'knob-creek-9': ['납 크릭', '납 크릭'],
  'suntory-old': ['산토리 올드', '[마감 D-2] 산토리 올드 위스키'],
  'the-nikka-tailored': ['닛카 테일러드', '닛카 테일러드 위스키'],
  'woodford-reserve': ['우드포드 리저브', '우드포드 리저브 버번 750ml'],
  'ichiros-white': ['이치로즈 몰트', '이치로즈 몰트\u0026그레인 월드 블렌디드 위스키'],
};

async function search(q) {
  const r = await fetch(`https://dailyshot.co/m/search/result?q=${encodeURIComponent(q)}`, { headers: { 'user-agent': UA } });
  const html = await r.text();
  const re = /"name":"([^"]*)","name_tag":[^,]*,"top_product_name":"[^"]*","en_name":"([^"]*)","thumbnail_image":"([^"]+)"[^}]*?"review_count":(\d+)/g;
  return [...html.matchAll(re)].map(([, name, en, img, reviews]) => ({ name, en, img, reviews: +reviews }));
}

function pick(w, items) {
  const want = [w.ko, w.en, ...w.aliases].map(key).filter(Boolean);
  const digits = (w.en.match(/\d+/) ?? [])[0];
  const scored = items
    .filter((it) => !SKIP.test(it.name))
    .map((it) => {
      const k = key(it.name) + '|' + key(it.en);
      let s = it.reviews / 1000;
      if (want.some((x) => k.includes(x))) s += 100;
      // 이름이 길수록 한정판·변형일 가능성이 높다
      s -= key(it.name).length * 0.3;
      if (/싱글배럴|더블오크|더블 오크|레어|라이|블랙|화이트|블루|그린|골드/.test(it.name) && !/싱글배럴|블랙|블루|화이트/.test(w.ko)) s -= 30;
      // 숙성 연수가 있으면 같은 숫자가 있어야 한다 (12년 vs 18년 혼동 방지)
      if (digits && !k.includes(digits)) s -= 200;
      if (!digits && /\d{2}/.test(it.name)) s -= 50;
      return { ...it, s };
    })
    .sort((a, b) => b.s - a.s);
  return scored[0]?.s > 50 ? scored[0] : null;
}

const report = [];
for (const w of list) {
  if (only.length && !only.includes(w.id)) continue;
  const file = new URL(`${w.id}.webp`, out);
  if (existsSync(file) && !force) continue;
  let best = null;
  if (PIN[w.id]) best = (await search(PIN[w.id][0])).find((it) => it.name === PIN[w.id][1]) ?? null;
  else for (const q of [QUERY[w.id], w.ko, w.ko.replace(/\s*NV$/, ''), w.en].filter(Boolean)) {
    best = pick(w, await search(q));
    if (best) break;
  }
  if (!best) { report.push(`✗ ${w.id}`); continue; }
  const img = await fetch(best.img, { headers: { 'user-agent': UA } });
  writeFileSync(file, Buffer.from(await img.arrayBuffer()));
  report.push(`✓ ${w.id} ← ${best.name}`);
  await new Promise((r) => setTimeout(r, 300));
}
console.log(report.join('\n'));
