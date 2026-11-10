// 체크리스트 '내 짐'(localStorage jp-check-bag)을 여러 앱이 같이 쓴다.
// 쇼핑·술 앱에서 결제를 마치면 산 물건을 '올 때' 챙길 짐으로 넣는다.
// 짐 항목: { id, name, go, back, src? } — src가 있으면 일본에서 산 것('shop:<일본어명>', 'liquor:<id>')
const KEY = 'jp-check-bag';

export function loadBag() {
  const b = JSON.parse(localStorage.getItem(KEY) || 'null') ?? {};
  return { items: b.items ?? [], phase: b.phase ?? 'go' };
}
export const saveBag = (bag) => localStorage.setItem(KEY, JSON.stringify(bag));
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// entries: [{ src, name }]. 이미 넣은 물건(같은 src)은 이름(수량)만 바꾼다. 새로 넣은 개수를 돌려준다.
export function addBought(entries) {
  const bag = loadBag();
  let added = 0;
  for (const { src, name } of entries) {
    const old = bag.items.find((it) => it.src === src);
    if (old) old.name = name;
    else {
      bag.items.push({ id: newId(), name, go: false, back: false, src });
      added++;
    }
  }
  saveBag(bag);
  return added;
}
