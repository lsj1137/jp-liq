import { confirmBox } from './common/ui.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const CATS = [
  ['food', '식비'],
  ['shop', '쇼핑'],
  ['move', '교통'],
  ['stay', '숙소'],
  ['tour', '관광'],
  ['etc', '기타'],
];
const CAT = Object.fromEntries(CATS);
const PAY = { cash: '현금', card: '카드' };
const KEY = 'jp-money';

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
};
const state = {
  // [{ id, date: 'YYYY-MM-DD', amount, cur: 'JPY'|'KRW', cat, pay, memo }]
  list: load(),
  // 술 가격 앱과 같은 도메인이라 그 앱이 저장한 환율을 같이 쓴다
  rate: Number(localStorage.getItem('krwPerJpy')) || 8.6,
  cat: 'all',
  editing: null,
};

const yen = (n) => `¥${Math.round(n).toLocaleString('ja-JP')}`;
const won = (n) => `${(Math.round(n / 100) * 100).toLocaleString('ko-KR')}원`;
// 직접 원화로 적은 금액은 반올림하지 않는다
const wonExact = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const toYen = (e) => (e.cur === 'KRW' ? e.amount / state.rate : e.amount);
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dayLabel = (d) => {
  const [, m, dd] = d.split('-');
  const w = '일월화수목금토'[new Date(d + 'T00:00:00').getDay()];
  return `${Number(m)}월 ${Number(dd)}일 (${w})`;
};

function save() {
  localStorage.setItem(KEY, JSON.stringify(state.list));
  render();
}

function render() {
  const all = state.list;
  const shown = all.filter((e) => state.cat === 'all' || e.cat === state.cat);
  const sum = (arr) => arr.reduce((a, e) => a + toYen(e), 0);

  const total = sum(shown);
  $('#sumYen').textContent = yen(total);
  $('#sumWon').textContent = `약 ${won(total * state.rate)}`;
  const cash = sum(shown.filter((e) => e.pay === 'cash'));
  $('#split').textContent = shown.length ? `현금 ${yen(cash)} · 카드 ${yen(total - cash)}` : '';
  $('#rate').textContent = `환율 ¥100 = ${(state.rate * 100).toFixed(1)}원`;

  if (!shown.length) {
    $('#list').innerHTML = `<li class="empty">${all.length ? '이 분류의 기록이 없어요.' : '아직 기록이 없어요.'}</li>`;
    return;
  }
  // 날짜별로 묶고 최신 날짜가 위로
  const days = new Map();
  for (const e of [...shown].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)) {
    if (!days.has(e.date)) days.set(e.date, []);
    days.get(e.date).push(e);
  }
  $('#list').innerHTML = [...days]
    .map(
      ([d, items]) => `<li class="day"><span>${dayLabel(d)}</span><span>${yen(sum(items))}</span></li>
      ${items
        .map(
          (e) => `<li class="row" data-id="${esc(e.id)}">
        <span class="cat">${CAT[e.cat]}</span>
        <div class="what"><p class="memo">${esc(e.memo || CAT[e.cat])}</p><p class="pay">${PAY[e.pay]}</p></div>
        <div class="amt">${
          e.cur === 'KRW'
            ? `<b>${wonExact(e.amount)}</b><span>${yen(toYen(e))}</span>`
            : `<b>${yen(e.amount)}</b><span>${won(e.amount * state.rate)}</span>`
        }</div>
      </li>`,
        )
        .join('')}`,
    )
    .join('');
}

// ── 기록 추가·수정 ────────────────────────────
const seg = (id) => $(`#${id} .on`).dataset.v;
const setSeg = (id, v) => $(`#${id}`).querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));

function updateConv() {
  const n = Number($('#amt').value);
  $('#conv').textContent = !n ? '' : seg('cur') === 'JPY' ? `약 ${won(n * state.rate)}` : `약 ${yen(n / state.rate)}`;
}

function openEdit(entry) {
  state.editing = entry?.id ?? null;
  $('#edit h2').textContent = entry ? '기록 수정' : '기록 추가';
  $('#amt').value = entry?.amount ?? '';
  setSeg('cur', entry?.cur ?? 'JPY');
  setSeg('pay', entry?.pay ?? localStorage.getItem('jp-money-pay') ?? 'cash');
  setSeg('catChips', entry?.cat ?? (state.cat !== 'all' ? state.cat : 'food'));
  $('#memo').value = entry?.memo ?? '';
  $('#date').value = entry?.date ?? today();
  $('#edit [data-del]').hidden = !entry;
  updateConv();
  $('#edit').showModal();
}

$('#catChips').innerHTML = CATS.map(([k, l]) => `<button type="button" data-v="${k}">${l}</button>`).join('');
for (const id of ['cur', 'pay', 'catChips']) {
  $(`#${id}`).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    setSeg(id, b.dataset.v);
    if (id === 'cur') updateConv();
  });
}
$('#amt').addEventListener('input', updateConv);
$('#addBtn').addEventListener('click', () => openEdit(null));
$('#list').addEventListener('click', (e) => {
  const row = e.target.closest('.row');
  if (row) openEdit(state.list.find((x) => x.id === Number(row.dataset.id)));
});
$('#edit form').addEventListener('submit', () => {
  const amount = Number($('#amt').value);
  if (!amount) return;
  state.list = load();
  const entry = {
    id: state.editing ?? Date.now(),
    date: $('#date').value || today(),
    amount,
    cur: seg('cur'),
    cat: seg('catChips'),
    pay: seg('pay'),
    memo: $('#memo').value.trim(),
  };
  localStorage.setItem('jp-money-pay', entry.pay);
  const i = state.list.findIndex((x) => x.id === entry.id);
  if (i >= 0) state.list[i] = entry;
  else state.list.push(entry);
  save();
});
$('#edit [data-cancel]').addEventListener('click', () => $('#edit').close());
$('#edit [data-del]').addEventListener('click', async () => {
  if (!(await confirmBox('이 기록을 지울까요?', '', { ok: '지우기', danger: true }))) return;
  state.list = load().filter((x) => x.id !== state.editing);
  $('#edit').close();
  save();
});
// 키보드의 완료(엔터)는 키보드만 닫는다 (실수로 저장되지 않게)
$('#edit').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input')) {
    e.preventDefault();
    e.target.blur();
  }
});

$('#cats').innerHTML =
  `<button class="on" data-cat="all">전체</button>` + CATS.map(([k, l]) => `<button data-cat="${k}">${l}</button>`).join('');
$('#cats').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.cat = b.dataset.cat;
  for (const x of $('#cats').children) x.classList.toggle('on', x === b);
  render();
});

render();
// 다른 앱에서 기록이 추가됐을 수 있으니 화면에 돌아올 때마다 다시 읽는다
const refresh = () => {
  if (document.visibilityState !== 'visible' || $('#edit').open) return;
  state.list = load();
  render();
};
addEventListener('pageshow', refresh);
document.addEventListener('visibilitychange', refresh);

// 환율: 술 가격 앱의 환율 API를 같이 쓴다. 오프라인이면 마지막 값.
fetch('../liquor/api/rate')
  .then((r) => r.json())
  .then((d) => {
    // 서버가 기본값(live:false)을 주면 저장된 마지막 실시간 환율을 그대로 쓴다
    if (d.live || !localStorage.getItem('krwPerJpy')) state.rate = d.krwPerJpy;
    if (d.live) localStorage.setItem('krwPerJpy', d.krwPerJpy);
    render();
  })
  .catch(() => {});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
