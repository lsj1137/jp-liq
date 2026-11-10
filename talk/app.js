const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const norm = (s) => s.normalize('NFKC').toLowerCase().replace(/[\s?？!！。、.,·~-]/g, '');

const state = { items: [], cats: [], cat: 'all' };

function render() {
  const q = norm($('#q').value);
  const items = state.items.filter(
    (it) => (state.cat === 'all' || it.cat === state.cat) && (!q || it._hay.includes(q)),
  );
  $('#count').textContent = `${items.length}개`;
  $('#list').innerHTML = items.length
    ? items
        .map(
          (it) => `<li class="row" data-i="${it._i}">
        <p class="ko">${esc(it.ko)}</p>
        <p class="ja" lang="ja">${esc(it.ja)}</p>
        <p class="read">${esc(it.read)}</p>
      </li>`,
        )
        .join('')
    : `<li class="empty">찾는 문장이 없어요.</li>`;
}

// 일본어 읽어주기는 기기에 일본어 음성이 있을 때만 보여준다
const canSpeak = 'speechSynthesis' in window;
function speak(text) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = 0.9;
  const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('ja'));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

function openCard(it) {
  const d = $('#card');
  d.querySelector('.ja').textContent = it.ja;
  d.querySelector('.read').textContent = it.read;
  d.querySelector('.ko').textContent = it.ko;
  d.querySelector('.note').textContent = it.note ?? '';
  d.querySelector('[data-speak]').hidden = !canSpeak;
  d.dataset.i = it._i;
  d.showModal();
}

$('#list').addEventListener('click', (e) => {
  const row = e.target.closest('.row');
  if (row) openCard(state.items[row.dataset.i]);
});
$('#card').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) $('#card').close();
  else if (e.target.closest('[data-speak]')) speak(state.items[$('#card').dataset.i].ja);
});
$('#card').addEventListener('close', () => canSpeak && speechSynthesis.cancel());
$('#q').addEventListener('input', render);
$('#cats').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.cat = b.dataset.cat;
  for (const x of $('#cats').children) x.classList.toggle('on', x === b);
  render();
});

const data = await (await fetch('data.json')).json();
state.cats = data.cats;
state.items = data.items.map((it, i) => ({ ...it, _i: i, _hay: norm(`${it.ko}|${it.ja}|${it.read}|${it.note ?? ''}`) }));
$('#cats').innerHTML =
  `<button class="on" data-cat="all">전체</button>` + data.cats.map(([k, label]) => `<button data-cat="${k}">${label}</button>`).join('');
render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
