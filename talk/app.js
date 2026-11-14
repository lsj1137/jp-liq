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

let cardJa = '';
function openCard(it) {
  const d = $('#card');
  d.querySelector('.ja').textContent = it.ja;
  d.querySelector('.read').textContent = it.read ?? '';
  d.querySelector('.ko').textContent = it.ko;
  d.querySelector('.note').textContent = it.note ?? '';
  d.querySelector('[data-speak]').hidden = !canSpeak;
  cardJa = it.ja;
  d.showModal();
}

$('#list').addEventListener('click', (e) => {
  const row = e.target.closest('.row');
  if (row) openCard(state.items[row.dataset.i]);
});
$('#card').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) $('#card').close();
  else if (e.target.closest('[data-speak]')) speak(cardJa);
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

// ── AI 번역 ─────────────────────────────────────
// 글은 입력을 멈추면 바로 번역, 말하기는 받아 적는 대로 보여 주고 끝나면 번역, 사진은 메뉴판·안내문을 줄별로.
// 최근 글 번역은 이 기기에 남겨서 다시 부르지 않고 바로 보여 줄 수 있다.
const API = '../liquor/api/translate';
const RECENT_KEY = 'jp-talk-recent';
const ai = { from: localStorage.getItem('jp-talk-from') === 'ja' ? 'ja' : 'ko', last: '', seq: 0, result: null };
const loadRecent = () => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
};
const status = (msg, err = false) => {
  $('#aiStatus').textContent = msg;
  $('#aiStatus').classList.toggle('err', err);
};

function renderDir() {
  const ko = ai.from === 'ko';
  $('#dirFrom').textContent = ko ? '한국어' : '일본어';
  $('#dirTo').textContent = ko ? '일본어' : '한국어';
  $('#src').placeholder = ko ? '하고 싶은 말을 한국어로 적어 보세요' : '일본어를 적거나, 상대가 말하게 해 보세요';
  $('#src').lang = ko ? 'ko' : 'ja';
}

function speakAs(text, lang) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.9;
  const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang.slice(0, 2)));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

function renderResult() {
  const r = ai.result;
  const recent = loadRecent().filter((x) => !r || x.ja !== r.ja);
  const recentHtml = recent.length
    ? `<div class="recent"><p>최근 번역</p>${recent
        .slice(0, 5)
        .map((x, i) => `<button type="button" data-recent="${i}">${esc(x.from === 'ja' ? x.ko : x.ja)}<span>${esc(x.from === 'ja' ? x.ja : x.ko)}</span></button>`)
        .join('')}</div>`
    : '';
  if (!r) return ($('#aiResult').innerHTML = recentHtml);
  if (r.lines) {
    $('#aiResult').innerHTML = `<div class="res photo">
      <p class="sum">${esc(r.summary || '사진 속 글자')}</p>
      ${r.lines.length ? `<ol>${r.lines.map((l) => `<li><p class="ja" lang="ja">${esc(l.ja)}</p><p class="ko">${esc(l.ko)}</p></li>`).join('')}</ol>` : ''}
    </div>${recentHtml}`;
    return;
  }
  // 한국어→일본어는 일본어를 크게(점원에게 보여 줄 것), 일본어→한국어는 한국어를 크게
  const toJa = r.from === 'ko';
  $('#aiResult').innerHTML = `<div class="res">
    ${toJa ? `<p class="big ja" lang="ja">${esc(r.ja)}</p><p class="read">${esc(r.read)}</p><p class="small">${esc(r.ko)}</p>` : `<p class="big">${esc(r.ko)}</p><p class="small ja" lang="ja">${esc(r.ja)}</p><p class="read">${esc(r.read)}</p>`}
    <div class="acts">
      ${toJa ? '<button type="button" class="primary" data-act="show">크게 보여 주기</button>' : ''}
      <button type="button" data-act="speak"${canSpeak ? '' : ' hidden'}>소리로 듣기</button>
    </div>
  </div>${recentHtml}`;
}

async function call(body) {
  const offline = '번역은 인터넷이 필요해요. 아래 문장 목록은 그대로 쓸 수 있어요.';
  if (!navigator.onLine) throw new Error(offline);
  let r;
  try {
    // 서버는 AI 재시도까지 30초 안에 답한다. 그보다 오래 걸리면 연결 문제로 보고 끊는다.
    r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(40000) });
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? '응답이 너무 늦어요. 잠시 뒤 다시 해 주세요.' : navigator.onLine ? '번역 서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.' : offline);
  }
  const d = await r.json().catch(() => ({ error: '번역 서버가 잠시 응답하지 않아요. 잠시 뒤 다시 해 주세요.' }));
  if (!r.ok || d.error) throw new Error(d.error || '번역하지 못했어요.');
  return d;
}

async function translateText(force = false) {
  const text = $('#src').value.trim();
  if (!text || (text === ai.last && !force)) return;
  ai.last = text;
  const seq = ++ai.seq;
  status('번역 중…');
  try {
    const d = await call({ text, from: ai.from });
    if (seq !== ai.seq) return; // 그새 더 입력했으면 이 결과는 버린다
    ai.result = { ...d, from: ai.from };
    localStorage.setItem(RECENT_KEY, JSON.stringify([ai.result, ...loadRecent().filter((x) => x.ja !== d.ja)].slice(0, 20)));
    status('');
    renderResult();
  } catch (e) {
    if (seq !== ai.seq) return;
    ai.last = '';
    status(e.message, true);
  }
}

let typing;
$('#src').addEventListener('input', () => {
  clearTimeout(typing);
  if ($('#src').value.trim().length < 2) return status('');
  typing = setTimeout(translateText, 800);
});
$('#src').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    clearTimeout(typing);
    $('#src').blur();
    translateText(true);
  }
});
$('#swap').addEventListener('click', () => {
  ai.from = ai.from === 'ko' ? 'ja' : 'ko';
  localStorage.setItem('jp-talk-from', ai.from);
  renderDir();
  // 방금 번역한 결과가 있으면 그 결과를 입력으로 바꿔 넣는다 (상대 답을 받아 적을 때 편하게)
  if (ai.result && !ai.result.lines) $('#src').value = ai.from === 'ko' ? ai.result.ko : ai.result.ja;
  else $('#src').value = '';
  ai.last = $('#src').value.trim();
  status('');
});
$('#aiResult').addEventListener('click', (e) => {
  const rec = e.target.closest('[data-recent]');
  if (rec) {
    const x = loadRecent().filter((r) => !ai.result || r.ja !== ai.result.ja)[Number(rec.dataset.recent)];
    if (!x) return;
    ai.result = x;
    renderResult();
    return x.from === 'ko' && openCard(x);
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  const r = ai.result;
  if (!r || r.lines) return;
  if (act === 'show') openCard(r);
  else if (act === 'speak') r.from === 'ko' ? speakAs(r.ja, 'ja-JP') : speakAs(r.ko, 'ko-KR');
});

// 말하기: 기기가 음성 인식을 지원할 때만. 받아 적는 대로 입력칸에 보여 주고, 말이 끝나면 번역한다.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
if (Recognition) $('#mic').hidden = false;
$('#mic').addEventListener('click', () => {
  if (rec) return rec.stop();
  rec = new Recognition();
  rec.lang = ai.from === 'ko' ? 'ko-KR' : 'ja-JP';
  rec.interimResults = true;
  rec.onresult = (e) => {
    $('#src').value = [...e.results].map((r) => r[0].transcript).join('');
  };
  rec.onerror = (e) => status(e.error === 'not-allowed' ? '마이크 권한을 허용해 주세요.' : '잘 듣지 못했어요. 다시 눌러 말해 주세요.', true);
  rec.onend = () => {
    rec = null;
    $('#mic').classList.remove('on');
    $('#mic span').textContent = '말하기';
    if ($('#src').value.trim()) translateText(true);
  };
  rec.start();
  $('#mic').classList.add('on');
  $('#mic span').textContent = '듣는 중…';
  status(ai.from === 'ko' ? '한국어로 말해 주세요' : '일본어로 말하게 해 주세요');
});

// 사진: 긴 변 1600px JPEG로 줄여서 보낸다
async function toDataUrl(file) {
  const img = await createImageBitmap(file);
  const s = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
$('#photoBtn').addEventListener('click', () => $('#photo').click());
$('#photo').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const seq = ++ai.seq;
  status('사진 읽는 중… (몇 초 걸려요)');
  try {
    const d = await call({ image: await toDataUrl(file) });
    if (seq !== ai.seq) return;
    ai.result = d;
    status('');
    renderResult();
  } catch (err) {
    if (seq === ai.seq) status(err.message, true);
  }
});
renderDir();
renderResult();

const data = await (await fetch('data.json')).json();
state.cats = data.cats;
state.items = data.items.map((it, i) => ({ ...it, _i: i, _hay: norm(`${it.ko}|${it.ja}|${it.read}|${it.note ?? ''}`) }));
$('#cats').innerHTML =
  `<button class="on" data-cat="all">전체</button>` + data.cats.map(([k, label]) => `<button data-cat="${k}">${label}</button>`).join('');
render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
