const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KEY = 'jp-check';

const state = { groups: [], items: [], done: new Set(JSON.parse(localStorage.getItem(KEY) || '[]')), group: 'all' };

// 설명 안의 **굵게** 는 주의할 숫자·날짜 강조
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

function render() {
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
  const row = e.target.closest('.row');
  if (!row) return;
  const id = row.dataset.id;
  if (state.done.has(id)) state.done.delete(id);
  else state.done.add(id);
  localStorage.setItem(KEY, JSON.stringify([...state.done]));
  render();
});
$('#reset').addEventListener('click', () => {
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
  `<button class="on" data-g="all">전체</button>` + data.groups.map(([k, l]) => `<button data-g="${k}">${l}</button>`).join('');
$("#asof").textContent = `${data.asof} 기준`;
render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
