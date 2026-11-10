// research/shop-picks-*.json 의 J픽·K픽 조사 결과를 shop/data.json 에 반영한다.
// j/k: 이미 있는 제품의 일본어 이름(ja) 목록, new: 새로 넣을 J픽 제품
// 사용: node research/shop-picks.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const dir = new URL('./', import.meta.url);
const target = new URL('../shop/data.json', import.meta.url);
const data = JSON.parse(readFileSync(target, 'utf8'));
const byJa = new Map(data.items.map((it) => [it.ja, it]));
for (const it of data.items) delete it.picks;

const mark = (it, p) => { it.picks = [...new Set([...(it.picks ?? []), p])].sort(); };
let unknown = 0, added = 0;
for (const f of readdirSync(dir).filter((f) => /^shop-picks-.*\.json$/.test(f))) {
  const r = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  for (const it of r.new ?? []) {
    const { src, ...item } = it;
    // 다시 돌리면 이미 들어간 새 제품은 내용만 갱신
    if (byJa.has(item.ja)) { Object.assign(byJa.get(item.ja), item); mark(byJa.get(item.ja), 'j'); continue; }
    const last = data.items.findLastIndex((x) => x.cat === item.cat);
    data.items.splice(last + 1, 0, item);
    byJa.set(item.ja, item);
    mark(item, 'j');
    added++;
  }
  for (const p of ['j', 'k']) {
    for (const ja of r[p] ?? []) {
      const it = byJa.get(ja);
      if (it) mark(it, p);
      else { console.warn(`없는 제품 (${f} ${p}): ${ja}`); unknown++; }
    }
  }
}
writeFileSync(target, JSON.stringify(data, null, 1) + '\n');
const count = (p) => data.items.filter((it) => it.picks?.includes(p)).length;
console.log(`전체 ${data.items.length}개 (새 제품 ${added}개) · J픽 ${count('j')} · K픽 ${count('k')}${unknown ? ` · 못 찾은 이름 ${unknown}개` : ''}`);
