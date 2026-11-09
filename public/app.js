const $ = (s) => document.querySelector(s);
const CATS = {
  japan: ['japan'],
  scotch: ['scotch'],
  etc: ['american', 'irish', 'other'],
  sake: ['sake'],
  shochu: ['shochu', 'awamori'],
  liqueur: ['liqueur', 'gin'],
  wine: ['wine'],
};
const CONF = { high: '높음', medium: '보통', low: '낮음' };
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

const state = {
  list: [],
  rate: Number(localStorage.getItem('krwPerJpy')) || 8.6,
  usd: Number(localStorage.getItem('usdPerJpy')) || 0.0064,
  // 면세 장바구니: [{ id, paid }] paid는 실제 결제한(할) 엔화
  cart: JSON.parse(localStorage.getItem('cart') || '[]'),
  rateNote: '저장된 환율',
  open: null,
  cat: 'all',
  sort: localStorage.getItem('sort') || 'default',
};

// 검색용 정규화: 대소문자·전각·히라가나/가타카나·띄어쓰기·기호 차이 무시
const norm = (s) =>
  s
    .normalize('NFKC')
    // NFKC가 초성 입력(ㅎ)을 조합용 자모(ᄒ)로 바꾸므로 되돌린다
    .replace(/[ᄀ-ᄒ]/g, (c) => CHO[c.charCodeAt(0) - 0x1100])
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[\s\-'’.,·・&!()]/g, '')
    .replace(/년|年|yearold/g, '');
const chosung = (s) =>
  [...s].map((c) => {
    const i = c.charCodeAt(0) - 0xac00;
    return i >= 0 && i < 11172 ? CHO[Math.floor(i / 588)] : c;
  }).join('');
const isChosung = (s) => /^[ㄱ-ㅎ0-9]+$/.test(s);
const STOP = new Set(['year', 'years', 'old', 'yo', 'the', '위스키', 'whisky', 'whiskey']);

function search(q) {
  const tokens = q.trim().split(/\s+/).map(norm).filter((t) => t && !STOP.has(t));
  if (!tokens.length) return state.list;
  const full = norm(q);
  return state.list
    .map((w, i) => {
      const hit = tokens.every((t) => w._hay.includes(t) || (isChosung(t) && w._cho.includes(t)));
      if (!hit) return null;
      const s = w._names.includes(full) ? 3 : w._names.some((n) => n.startsWith(full)) ? 2 : 1;
      return { w, s, i };
    })
    .filter(Boolean)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.w);
}

const won = (n) => `${(Math.round(n / 1000) * 1000).toLocaleString('ko-KR')}원`;
const man = (n) => `${Math.round(n / 1000) / 10}만`.replace(/(\d)(?=(\d{3})+만)/g, '$1,');
const yen = (n) => `¥${Math.round(n).toLocaleString('ja-JP')}`;

// 한국 평균 대비 일본 가격(원화)이 몇 % 싼지. 한국 가격이 없으면 null.
const saving = (w, jpKrw = w.jp[1] * state.rate) => (w.kr ? Math.round((1 - jpKrw / w.kr[1]) * 100) : null);

function verdict(w, jpKrw) {
  if (!w.kr) return '한국 일반 매장에서는 팔지 않음';
  const diff = w.kr[1] - jpKrw;
  const pct = saving(w, jpKrw);
  if (Math.abs(pct) < 3) return '한국과 비슷함';
  return diff > 0 ? `일본이 <b class="cheap">${won(diff)}</b> 저렴 (${pct}%)` : `한국이 <b>${won(-diff)}</b> 더 저렴`;
}

const bottle = (w) => `<img class="bottle" src="img/${w.id}.webp" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'bottle none'}))" />`;

function row(w) {
  const jpKrw = w.jp[1] * state.rate;
  const pct = saving(w, jpKrw);
  const open = state.open === w.id;
  const badge = pct === null ? '' : pct >= 3 ? `<span class="pct">−${pct}%</span>` : pct <= -3 ? `<span class="pct up">+${-pct}%</span>` : '';
  return `
  <li class="row${open ? ' open' : ''}" data-id="${w.id}">
    <div class="head">
      ${bottle(w)}
      <div class="body">
        <p class="name"><strong>${w.ko}</strong><span>${w.ml}ml</span></p>
        <p class="sub">${w.en}</p>
        <div class="pp">
          <p><span class="lb">한국</span><b>${w.kr ? won(w.kr[1]) : '판매처 없음'}</b></p>
          <p><span class="lb">일본</span><b>${yen(w.jp[1])}</b><span class="krw">${won(jpKrw)}</span>${badge}</p>
        </div>
      </div>
    </div>
    ${open ? `
    <div class="detail">
      <p class="range">가격 범위 · 한국 ${w.kr ? `${man(w.kr[0])}~${man(w.kr[2])}원` : '없음'} · 일본 ${yen(w.jp[0])}~${yen(w.jp[2]).slice(1)}</p>
      <p class="verdict">${verdict(w, jpKrw)}</p>
      <div class="calc">
        <input type="number" inputmode="numeric" placeholder="매장 가격 입력 (¥)" data-calc />
        <label class="tax"><input type="checkbox" data-tax checked /> 면세</label>
      </div>
      <output data-out></output>
      <button type="button" class="add" data-add>${inCart(w.id) ? `장바구니에 ${inCart(w.id)}병 담김 · 하나 더 담기` : '면세 장바구니에 담기'}</button>
      ${w.note ? `<details class="info"><summary>가격 출처 · 신뢰도 ${CONF[w.conf] ?? '-'} · ${w.updated}</summary>
        <p>${w.note}</p>
        <p>${w.src.map((u) => `<a href="${u}" target="_blank" rel="noopener">${new URL(u).hostname.replace(/^www\./, '')}</a>`).join(', ')}</p>
      </details>` : ''}
    </div>` : ''}
  </li>`;
}

// 한국 가격이 없는 제품은 할인율·한국 가격 정렬에서 맨 뒤로 보낸다
const SORTS = {
  pct: (a, b) => (saving(b) ?? -1e9) - (saving(a) ?? -1e9),
  krDesc: (a, b) => (b.kr?.[1] ?? -1) - (a.kr?.[1] ?? -1),
  krAsc: (a, b) => (a.kr?.[1] ?? Infinity) - (b.kr?.[1] ?? Infinity),
  jpDesc: (a, b) => b.jp[1] - a.jp[1],
  jpAsc: (a, b) => a.jp[1] - b.jp[1],
  name: (a, b) => a.ko.localeCompare(b.ko, 'ko'),
};

function render() {
  const items = search($('#q').value).filter((w) => state.cat === 'all' || CATS[state.cat].includes(w.cat));
  if (SORTS[state.sort]) items.sort(SORTS[state.sort]);
  if (state.open === 'first') state.open = $('#q').value.trim() ? items[0]?.id : null;
  $('#list').innerHTML = items.length
    ? items.map(row).join('')
    : `<li class="empty">찾는 술이 없어요. 영어나 일본어 이름으로도 검색해 보세요.</li>`;
  $('#count').textContent = `${items.length}개`;
}

// 매장 가격을 입력했으면 그 값, 아니면 일본 평균가. 면세에 체크돼 있으면 소비세 10%를 뺀다.
function paidYen(el, w) {
  const price = Number(el.querySelector('[data-calc]').value) || w.jp[1];
  return el.querySelector('[data-tax]').checked ? price / 1.1 : price;
}

function updateCalc(el) {
  const w = state.list.find((x) => x.id === el.dataset.id);
  const out = el.querySelector('[data-out]');
  if (!Number(el.querySelector('[data-calc]').value)) return (out.innerHTML = '');
  const paid = paidYen(el, w);
  const krw = paid * state.rate;
  out.innerHTML = `실제 결제 ${yen(paid)} ≈ ${won(krw)}<br>${verdict(w, krw)}`;
}

function setStatus(text, err = false) {
  const el = $('#status');
  el.textContent = text;
  el.classList.toggle('err', err);
}

function renderRate() {
  $("#rate").textContent = `환율 ¥100 = ${(state.rate * 100).toFixed(1)}원`;
  $("#rate").title = state.rateNote;
}

async function loadRate() {
  try {
    const d = await (await fetch('/api/rate')).json();
    state.rate = d.krwPerJpy;
    state.usd = d.usdPerJpy ?? state.usd;
    state.rateNote = d.live ? `실시간 · ${new Date(d.updated).toLocaleDateString('ko-KR')}` : '기본값';
    if (d.live) {
      localStorage.setItem('krwPerJpy', d.krwPerJpy);
      if (d.usdPerJpy) localStorage.setItem('usdPerJpy', d.usdPerJpy);
    }
  } catch {
    // 오프라인이면 저장된 환율 사용
  }
  renderRate();
  render();
  renderCart();
}

// 업로드 용량과 인식 시간을 줄이려고 긴 변 1024px JPEG로 줄여서 보낸다.
// source는 파일(Blob)이나 카메라에서 캡처한 ImageBitmap.
async function toDataUrl(source, max = 1024) {
  const img = await createImageBitmap(source);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

async function identify(source) {
  const cam = $('.cam');
  cam.classList.add('busy');
  setStatus('라벨 읽는 중…');
  try {
    const r = await fetch('/api/identify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: await toDataUrl(source) }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    const w = state.list.find((x) => x.id === d.id);
    if (w) {
      $('#q').value = w.ko;
      state.open = w.id;
      setStatus(`사진 인식: ${d.name ?? w.en}`);
    } else {
      $('#q').value = d.name ?? '';
      setStatus(d.name ? `"${d.name}"은(는) 목록에 없는 제품입니다.` : '사진에서 술을 찾지 못했습니다.', true);
    }
    render();
  } catch (e) {
    setStatus(navigator.onLine ? e.message || '사진 인식에 실패했어요.' : '인터넷이 연결되지 않아 사진 인식을 할 수 없어요. 이름으로 검색해 주세요.', true);
  } finally {
    cam.classList.remove('busy');
  }
}

$('#q').addEventListener('input', () => {
  // 검색어를 칠 때는 맨 위 결과를 바로 펼쳐서 보여준다
  state.open = 'first';
  setStatus('');
  render();
});
// 앱 안에서 바로 찍는 카메라. 권한이 없거나 HTTPS가 아니면 기본 파일 선택(폰에선 카메라 앱)으로 넘어간다.
let stream = null;
let noCamera = !navigator.mediaDevices?.getUserMedia;

async function openCamera() {
  if (noCamera) return $('#photo').click();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
  } catch {
    noCamera = true;
    setStatus('카메라를 열 수 없어요. 카메라 버튼을 다시 누르면 사진을 고를 수 있어요.', true);
    return;
  }
  const video = $('#camera video');
  video.srcObject = stream;
  $('#camera').showModal();
  await video.play();
}

function closeCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if ($('#camera').open) $('#camera').close();
}

$('#cam').addEventListener('click', openCamera);
$('#camera').addEventListener('cancel', closeCamera);
$('#camera').addEventListener('click', async (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'shot') {
    const shot = await createImageBitmap($('#camera video'));
    closeCamera();
    identify(shot);
  } else if (act === 'album') {
    closeCamera();
    $('#photo').click();
  } else if (act === 'close') {
    closeCamera();
  }
});
$('#photo').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) identify(file);
});
$('#list').addEventListener('click', (e) => {
  const el = e.target.closest('.row');
  if (el && e.target.matches('img.bottle')) {
    const w = state.list.find((x) => x.id === el.dataset.id);
    const v = $('#viewer');
    v.querySelector('img').src = e.target.src;
    v.querySelector('p').textContent = `${w.ko} · ${w.ml}ml`;
    v.showModal();
    return;
  }
  if (!el || !e.target.closest('.head')) return;
  state.open = state.open === el.dataset.id ? null : el.dataset.id;
  render();
});
$('#list').addEventListener('input', (e) => {
  if (e.target.matches('[data-calc], [data-tax]')) updateCalc(e.target.closest('.row'));
});
$('#viewer').addEventListener('click', () => $('#viewer').close());
$('#sort').value = state.sort;
$('#sort').addEventListener('change', (e) => {
  state.sort = e.target.value;
  localStorage.setItem('sort', state.sort);
  render();
});
$('#cats').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.cat = b.dataset.cat;
  for (const x of $('#cats').children) x.classList.toggle('on', x === b);
  render();
});

// '전체' 탭도 위 분류 탭과 같은 순서로 보여준다
const ORDER = ['japan', 'sake', 'shochu', 'awamori', 'liqueur', 'gin', 'wine', 'scotch', 'american', 'irish', 'other'];
state.list = (await (await fetch('whiskies.json')).json())
  .sort((a, b) => ORDER.indexOf(a.cat) - ORDER.indexOf(b.cat))
  .map((w) => {
    const names = [w.ko, w.en, w.ja, ...w.aliases].map(norm);
    const hay = names.join('|');
    return { ...w, _names: names, _hay: hay, _cho: chosung(hay) };
  });
$('#q').value = new URLSearchParams(location.search).get('q') ?? '';
state.open = 'first';
renderRate();
render();
loadRate();

// ── 면세 장바구니 ───────────────────────────────────────────
// 한국 입국 시 술 면세 한도 (관세청, 2025.3.21부터 병 수 제한 없음): 합계 2L 이하이고 $400 이하.
const DUTY_FREE = { ml: 2000, usd: 400 };

// 여행자 주류 세율 (간이세율 미적용). 관세 t, 주세 a, 교육세 e(주세 대비), 부가세 10%.
// 총세율 = (1+t)(1+a(1+e))×1.1 − 1 → 위스키·진·리큐르 약 156%, 소주 약 177%, 사케·와인 약 68%.
// 일본산 RCEP 협정세율은 공항 적용 여부가 불확실해 일반 세율을 쓴다.
const TAX = {
  spirits: { t: 0.2, a: 0.72, e: 0.3 },
  shochu: { t: 0.3, a: 0.72, e: 0.3 },
  // 사케(청주)와 와인(과실주)은 관세 15%·주세 30%·교육세 10%로 같다
  brewed: { t: 0.15, a: 0.3, e: 0.1 },
};
const taxKind = (cat) => (cat === 'sake' || cat === 'wine' ? 'brewed' : cat === 'shochu' || cat === 'awamori' ? 'shochu' : 'spirits');

function bottleTax(c) {
  const { t, a, e } = TAX[taxKind(c.w.cat)];
  const price = c.paid * state.rate;
  return { total: price * ((1 + t) * (1 + a * (1 + e)) * 1.1 - 1), duty: price * t };
}

// 한도를 넘으면 세관은 세금이 가장 적게 나오도록 면세할 병을 고른다. 병 수가 적으니 모든 조합을 본다.
function estimateTax({ items, ml, usd: usdSum }) {
  if (ml <= DUTY_FREE.ml && usdSum <= DUTY_FREE.usd) return null;
  const taxes = items.map(bottleTax);
  const n = Math.min(items.length, 16);
  let best = { total: Infinity };
  for (let mask = 0; mask < 1 << n; mask++) {
    let m = 0, u = 0, total = 0, duty = 0;
    const taxed = [];
    for (let i = 0; i < items.length; i++) {
      if (i < n && mask & (1 << i)) {
        m += items[i].w.ml;
        u += items[i].paid * state.usd;
      } else {
        total += taxes[i].total;
        duty += taxes[i].duty;
        taxed.push(i);
      }
    }
    if (m <= DUTY_FREE.ml && u <= DUTY_FREE.usd && total < best.total) best = { total, duty, taxed };
  }
  return { ...best, declared: best.total - Math.min(best.duty * 0.3, 200000) };
}

const inCart = (id) => state.cart.filter((c) => c.id === id).length;
const byId = (id) => state.list.find((w) => w.id === id);
const usd = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

function saveCart() {
  localStorage.setItem('cart', JSON.stringify(state.cart));
  renderCart();
}

function cartTotals() {
  const items = state.cart.map((c) => ({ ...c, w: byId(c.id) })).filter((c) => c.w);
  const ml = items.reduce((a, c) => a + c.w.ml, 0);
  const yenSum = items.reduce((a, c) => a + c.paid, 0);
  return { items, count: items.length, ml, yen: yenSum, usd: yenSum * state.usd };
}

function renderCart() {
  const t = cartTotals();
  const bar = $('#cartbar');
  bar.hidden = !t.count;
  if (!t.count) return;
  const over = t.ml > DUTY_FREE.ml || t.usd > DUTY_FREE.usd;
  bar.querySelector('.sum').textContent = `${t.count}병 · ${(t.ml / 1000).toFixed(2)}L · ${usd(t.usd)}`;
  const flag = bar.querySelector('.flag');
  flag.textContent = over ? '면세 한도 초과' : '면세 범위 안';
  flag.classList.toggle('over', over);
  if ($('#cart').open) renderCartDialog();
}

function meter(label, value, limit, fmt) {
  const over = value > limit;
  return `<div class="meter${over ? ' over' : ''}">
    <p><span>${label}</span><b>${fmt(value)} / ${fmt(limit)}</b></p>
    <i style="--w:${Math.min(100, (value / limit) * 100)}%"></i>
  </div>`;
}

function renderCartDialog() {
  const t = cartTotals();
  const tax = estimateTax(t);
  $('#cart .content').innerHTML = `
    <h2>면세 장바구니 <small>${t.count}병</small></h2>
    ${meter('용량', t.ml, DUTY_FREE.ml, (n) => `${(n / 1000).toFixed(2)}L`)}
    ${meter('금액', t.usd, DUTY_FREE.usd, usd)}
    <p class="verdict">${
      tax
        ? `면세 한도를 넘어서 <b class="cheap">${tax.taxed.length}병</b>에 세금이 붙어요.<br>
           예상 세금 약 <b class="cheap">${won(tax.total)}</b> · 자진신고하면 약 <b>${won(tax.declared)}</b>`
        : '한국 입국 시 술 면세 범위 안이에요.'
    }</p>
    <ul class="items">
      ${t.items
        .map(
          (c, i) => `<li>
        <span class="nm">${tax?.taxed.includes(i) ? '<em>과세</em>' : ''}${c.w.ko} <small>${c.w.ml}ml</small></span>
        <label>¥<input type="number" inputmode="numeric" value="${Math.round(c.paid)}" data-idx="${i}" /></label>
        <button type="button" class="del" data-del="${i}" aria-label="빼기">✕</button>
      </li>`,
        )
        .join('')}
    </ul>
    <p class="note">가격은 실제 결제액(일본 면세 적용 후) 기준이고 직접 고칠 수 있어요. 세금은 위스키·진·리큐르 약 156%, 소주 약 177%, 사케·와인 약 68%로 계산한 추정치예요(세관은 주간 고시 환율을 써서 조금 다를 수 있어요). 영수증은 꼭 챙기세요.</p>
    <div class="actions">
      <button type="button" data-clear>비우기</button>
      <button type="button" class="primary" data-close>닫기</button>
    </div>`;
}

$('#list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-add]');
  if (!btn) return;
  const el = btn.closest('.row');
  const w = byId(el.dataset.id);
  state.cart.push({ id: w.id, paid: Math.round(paidYen(el, w)) });
  saveCart();
  btn.textContent = `장바구니에 ${inCart(w.id)}병 담김 · 하나 더 담기`;
});
$('#cartbar').addEventListener('click', () => {
  renderCartDialog();
  $('#cart').showModal();
});
$('#cart').addEventListener('click', (e) => {
  if (e.target === $('#cart') || e.target.closest('[data-close]')) return $('#cart').close();
  const del = e.target.closest('[data-del]');
  if (del) {
    state.cart.splice(Number(del.dataset.del), 1);
    saveCart();
    if (!state.cart.length) $('#cart').close();
    render();
  } else if (e.target.closest('[data-clear]')) {
    state.cart = [];
    saveCart();
    $('#cart').close();
    render();
  }
});
$('#cart').addEventListener('change', (e) => {
  const idx = e.target.dataset.idx;
  if (idx === undefined) return;
  state.cart[Number(idx)].paid = Math.max(0, Number(e.target.value) || 0);
  saveCart();
});
renderCart();

// 오프라인에서도 열리도록 서비스 워커 등록 (sw.js)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
