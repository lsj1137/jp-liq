const $ = (s) => document.querySelector(s);
const CATS = {
  japan: ['japan'],
  scotch: ['scotch'],
  etc: ['american', 'irish', 'other'],
  sake: ['sake'],
  shochu: ['shochu', 'awamori'],
  liqueur: ['liqueur', 'gin'],
};
const CONF = { high: '높음', medium: '보통', low: '낮음' };
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

const state = {
  list: [],
  rate: Number(localStorage.getItem('krwPerJpy')) || 8.6,
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

function updateCalc(el) {
  const w = state.list.find((x) => x.id === el.dataset.id);
  const price = Number(el.querySelector('[data-calc]').value);
  const out = el.querySelector('[data-out]');
  if (!price) return (out.innerHTML = '');
  const paid = el.querySelector('[data-tax]').checked ? price / 1.1 : price;
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
    state.rateNote = d.live ? `실시간 · ${new Date(d.updated).toLocaleDateString('ko-KR')}` : '기본값';
    if (d.live) localStorage.setItem('krwPerJpy', d.krwPerJpy);
  } catch {
    // 오프라인이면 저장된 환율 사용
  }
  renderRate();
  render();
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
    setStatus(e.message || '사진 인식에 실패했어요.', true);
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
const ORDER = ['japan', 'sake', 'shochu', 'awamori', 'liqueur', 'gin', 'scotch', 'american', 'irish', 'other'];
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
