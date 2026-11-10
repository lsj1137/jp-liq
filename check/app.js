const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KEY = 'jp-check';

const state = { groups: [], items: [], done: new Set(JSON.parse(localStorage.getItem(KEY) || '[]')), group: 'all' };

// 내 짐: 직접 적은 준비물을 갈 때·올 때 따로 체크한다. { items: [{ id, name, go, back }], phase: 'go' | 'back' }
const BAG_KEY = 'jp-check-bag';
const bag = JSON.parse(localStorage.getItem(BAG_KEY) || '{"items":[],"phase":"go"}');
const saveBag = () => localStorage.setItem(BAG_KEY, JSON.stringify(bag));
const PHASES = { go: '갈 때', back: '올 때' };
// 자주 챙기고, 돌아올 때 숙소에 두고 오기 쉬운 것
const SUGGEST = ['여권', '지갑·카드', '휴대폰 충전기', '보조배터리', '돼지코(110V 어댑터)', '이어폰', '안경·렌즈', '상비약', '세면도구', '화장품 파우치', '잠옷', '우산', '선글라스', '목베개', '카메라·충전기', '손목시계'];

// 설명 안의 **굵게** 는 주의할 숫자·날짜 강조
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

function renderBag() {
  const n = bag.items.length;
  const doneOf = (ph) => bag.items.filter((it) => it[ph]).length;
  $('#bar').style.width = `${n ? (doneOf(bag.phase) / n) * 100 : 0}%`;
  $('#count').innerHTML = `<span class="seg" role="group" aria-label="갈 때·올 때">${Object.entries(PHASES)
    .map(([k, l]) => `<button type="button" data-phase="${k}" class="${bag.phase === k ? 'on' : ''}">${l} ${doneOf(k)}/${n}</button>`)
    .join('')}</span>`;
  const left = SUGGEST.filter((name) => !bag.items.some((it) => it.name === name));
  $('#list').innerHTML =
    `<li class="addrow"><form id="addForm"><input id="addName" placeholder="챙겨 갈 물건" autocomplete="off" enterkeyhint="done" maxlength="40" /><button type="submit">추가</button></form></li>` +
    bag.items
      .map(
        (it) => `<li class="row mine${it[bag.phase] ? ' done' : ''}" data-bag="${it.id}">
          <span class="box" aria-hidden="true">✓</span>
          <div class="txt"><p class="t">${esc(it.name)}</p>${bag.phase === 'back' && !it.go ? '<p class="d">갈 때 체크 안 함</p>' : ''}</div>
          <button type="button" class="del" aria-label="${esc(it.name)} 지우기">×</button>
        </li>`,
      )
      .join('') +
    (left.length
      ? `<li class="group">자주 챙기는 것</li>` +
        left.map((name) => `<li class="row sug" data-sug="${esc(name)}"><span class="plus" aria-hidden="true">+</span><div class="txt"><p class="t">${esc(name)}</p></div></li>`).join('')
      : '');
}

function addBag(name) {
  name = name.trim();
  if (!name || bag.items.some((it) => it.name === name)) return;
  bag.items.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, go: false, back: false });
  saveBag();
}

function render() {
  $('main').classList.toggle('bagview', state.group === 'mine');
  if (state.group === 'mine') return renderBag();
  const total = state.items.length;
  const done = state.items.filter((it) => state.done.has(it.id)).length;
  $('#bar').style.width = `${total ? (done / total) * 100 : 0}%`;
  $('#count').textContent = `${done} / ${total} 완료`;

  const groups = state.groups.filter(([k]) => state.group === 'all' || k === state.group);
  $('#list').innerHTML = groups
    .map(([k, label]) => {
      const items = state.items.filter((it) => it.group === k);
      return `${state.group === 'all' ? `<li class="group">${label}</li>` : ''}${items
        .map(
          (it) => `<li class="row${state.done.has(it.id) ? ' done' : ''}" data-id="${it.id}">
          <span class="box" aria-hidden="true">✓</span>
          <div class="txt">
            <p class="t">${esc(it.title)}${it.new ? '<i class="tag">변경</i>' : ''}</p>
            <p class="d">${rich(it.desc)}</p>
            ${it.src ? `<a class="src" href="${esc(it.src)}" target="_blank" rel="noopener">출처: ${esc(new URL(it.src).hostname.replace(/^www\./, ''))}</a>` : ''}
          </div>
        </li>`,
        )
        .join('')}`;
    })
    .join('');
}

$('#list').addEventListener('click', (e) => {
  if (e.target.closest('a')) return;
  const mine = e.target.closest('[data-bag]');
  if (mine) {
    const it = bag.items.find((x) => x.id === mine.dataset.bag);
    if (e.target.closest('.del')) {
      if (!confirm(`'${it.name}'을(를) 목록에서 지울까요?`)) return;
      bag.items = bag.items.filter((x) => x !== it);
    } else it[bag.phase] = !it[bag.phase];
    saveBag();
    return render();
  }
  const sug = e.target.closest('[data-sug]');
  if (sug) {
    addBag(sug.dataset.sug);
    return render();
  }
  const row = e.target.closest('.row');
  if (!row) return;
  const id = row.dataset.id;
  if (state.done.has(id)) state.done.delete(id);
  else state.done.add(id);
  localStorage.setItem(KEY, JSON.stringify([...state.done]));
  render();
});
$('#list').addEventListener('submit', (e) => {
  e.preventDefault();
  addBag($('#addName').value);
  render();
  $('#addName').focus();
});
$('#count').addEventListener('click', (e) => {
  const b = e.target.closest('[data-phase]');
  if (!b) return;
  bag.phase = b.dataset.phase;
  saveBag();
  render();
});
$('#reset').addEventListener('click', () => {
  if (state.group === 'mine') {
    if (!bag.items.some((it) => it[bag.phase]) || !confirm(`${PHASES[bag.phase]} 체크를 모두 지울까요?`)) return;
    for (const it of bag.items) it[bag.phase] = false;
    saveBag();
    return render();
  }
  if (!state.done.size || !confirm('체크한 항목을 모두 지울까요?')) return;
  state.done.clear();
  localStorage.removeItem(KEY);
  render();
});
$('#cats').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.group = b.dataset.g;
  for (const x of $('#cats').children) x.classList.toggle('on', x === b);
  render();
});

const data = await (await fetch('data.json')).json();
state.groups = data.groups;
state.items = data.items;
$('#cats').innerHTML =
  `<button class="on" data-g="all">전체</button><button data-g="mine">내 짐</button>` + data.groups.map(([k, l]) => `<button data-g="${k}">${l}</button>`).join('');
$("#asof").textContent = `${data.asof} 기준`;
render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
