// research/*.json 의 조사 결과를 liquor/whiskies.json 에 반영한다.
// 사용: node research/merge.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const dir = new URL('./', import.meta.url);
const target = new URL('../liquor/whiskies.json', import.meta.url);
const list = JSON.parse(readFileSync(target, 'utf8'));
const byId = new Map(list.map((w) => [w.id, w]));
const updated = new Date().toISOString().slice(0, 7);

let n = 0;
let added = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  for (const r of JSON.parse(readFileSync(new URL(f, dir), 'utf8'))) {
    let w = byId.get(r.id);
    if (!w) {
      if (!r.en || !r.ko || !r.cat) { console.warn(`알 수 없는 id: ${r.id} (${f})`); continue; }
      // 새 제품은 같은 분류의 마지막 제품 뒤에 넣는다
      w = { id: r.id, en: r.en, ko: r.ko, ja: r.ja ?? '', aliases: r.aliases ?? [], cat: r.cat, ml: r.ml ?? 700 };
      const last = list.findLastIndex((x) => x.cat === r.cat);
      list.splice(last === -1 ? list.length : last + 1, 0, w);
      byId.set(r.id, w);
      added++;
    }
    Object.assign(w, {
      ...(r.ml && { ml: r.ml }),
      kr: r.kr, jp: r.jp,
      conf: r.confidence, note: r.note,
      src: [...r.kr_sources, ...r.jp_sources],
      updated,
    });
    n++;
  }
}
const missing = list.filter((w) => !w.updated).map((w) => w.id);
writeFileSync(target, '[\n' + list.map((w) => '  ' + JSON.stringify(w)).join(',\n') + '\n]\n');
console.log(`${n}개 반영 (새 제품 ${added}개)${missing.length ? `, 조사 안 된 항목: ${missing.join(', ')}` : ''}`);
