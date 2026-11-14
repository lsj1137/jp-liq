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
  history.pushState({ card: 1 }, '');
}

$('#list').addEventListener('click', (e) => {
  const row = e.target.closest('.row');
  if (row) openCard(state.items[row.dataset.i]);
});
// 닫기 버튼·Esc는 기록을 되돌려서(popstate) 닫는다 → 휴대폰 뒤로가기와 같은 길
$('#card').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) history.back();
  else if (e.target.closest('[data-speak]')) speak(cardJa);
});
$('#card').addEventListener('cancel', (e) => {
  e.preventDefault();
  history.back();
});
addEventListener('popstate', () => $('#card').open && $('#card').close());
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

// 한국어→일본어: 내가 아래에서 적거나 말하면 위쪽(상대)에 일본어가 크게.
// 일본어→한국어: 상대가 말하면 아래쪽(나)에 한국어가 크게. 이때는 입력칸을 숨긴다.
function renderDir() {
  const ko = ai.from === 'ko';
  $('#dirFrom').textContent = ko ? '한국어' : '일본어';
  $('#dirTo').textContent = ko ? '일본어' : '한국어';
  $('#src').hidden = !ko;
  renderThem();
}

// 위쪽 반(상대방 쪽): 번역된 일본어, 없으면 상대에게 보이는 안내(일본어)
function renderThem(listening = false) {
  const r = ai.result && !ai.result.lines ? ai.result : null;
  const el = $('#themText');
  const text = listening && ai.from === 'ja' ? 'どうぞ、お話しください…' : r ? r.ja : ai.from === 'ja' ? '日本語で話してください。韓国語に翻訳します。' : 'ここに日本語が表示されます';
  el.textContent = text;
  el.classList.toggle('empty', !r || (listening && ai.from === 'ja'));
  $('#sayJa').hidden = !(r && canSpeak) || (listening && ai.from === 'ja');
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

// 아래쪽 반(내 쪽): 한국어. 한→일이면 일본어 읽는 법, 일→한이면 번역된 한국어를 크게. 사진은 줄별 번역. 그 아래 최근 번역.
function renderResult() {
  renderThem();
  const r = ai.result;
  renderRecent();
  let main = '';
  if (r?.lines) {
    main = `<div class="res photo">
      <p class="sum">${esc(r.summary || '사진 속 글자')}</p>
      ${r.lines.length ? `<ol>${r.lines.map((l) => `<li><p class="ja" lang="ja">${esc(l.ja)}</p><p class="ko">${esc(l.ko)}</p></li>`).join('')}</ol>` : ''}
    </div>`;
  } else if (r && r.from === 'ja') {
    main = `<div class="res"><p class="big">${esc(r.ko)}</p><p class="small ja" lang="ja">${esc(r.ja)}</p></div>`;
  } else if (r) {
    main = `<div class="res"><p class="read"><b>읽는 법</b>${esc(r.read)}</p>${$('#src').value.trim() === r.ko ? '' : `<p class="small">${esc(r.ko)}</p>`}</div>`;
  }
  $('#aiResult').innerHTML = main;
}

// 최근 번역 시트
function renderRecent() {
  const list = loadRecent();
  $('#recentBtn').hidden = !list.length;
  $('#recentN').textContent = list.length;
  $('#recentList').innerHTML = list.map((x, i) => `<button type="button" data-recent="${i}">${esc(x.ko)}<span lang="ja">${esc(x.ja)}</span></button>`).join('');
}
function sheet(open) {
  $('#recentSheet').classList.toggle('open', open);
  $('#recentSheet').setAttribute('aria-hidden', String(!open));
}
$('#recentBtn').addEventListener('click', () => sheet(true));
$('#recentClose').addEventListener('click', () => sheet(false));
$('#recentList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-recent]');
  const x = b && loadRecent()[Number(b.dataset.recent)];
  if (!x) return;
  ai.result = x;
  if (ai.from === 'ko') $('#src').value = x.ko;
  ai.last = $('#src').value.trim();
  renderResult();
  sheet(false);
});
// 쓸어 올리기·내리기: 아래쪽 반에서 위로 쓸면 열고, 시트를 아래로 쓸면 닫는다
function swipe(el, onSwipe) {
  let y0 = null;
  el.addEventListener('touchstart', (e) => (y0 = e.touches[0].clientY), { passive: true });
  el.addEventListener('touchend', (e) => {
    if (y0 === null) return;
    const dy = e.changedTouches[0].clientY - y0;
    y0 = null;
    if (Math.abs(dy) > 50) onSwipe(dy < 0 ? 'up' : 'down');
  });
}
swipe($('#trans .me'), (dir) => {
  // 아래쪽 반이 스크롤 중이면(맨 아래가 아니면) 스크롤로 둔다
  const me = $('#trans .me');
  if (dir === 'up' && loadRecent().length && me.scrollTop + me.clientHeight >= me.scrollHeight - 4) sheet(true);
});
swipe($('#recentSheet'), (dir) => {
  if (dir === 'down' && $('#recentList').scrollTop <= 0) sheet(false);
});

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

function showResult(d, from) {
  ai.result = { ja: d.ja, read: d.read, ko: d.ko, from };
  localStorage.setItem(RECENT_KEY, JSON.stringify([ai.result, ...loadRecent().filter((x) => x.ja !== d.ja)].slice(0, 20)));
  status('');
  renderResult();
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
    showResult(d, ai.from);
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
  micUi(false);
  // 방금 번역한 결과가 있으면 그 결과를 입력으로 바꿔 넣는다 (상대 답을 받아 적을 때 편하게)
  $('#src').value = ai.from === 'ko' && ai.result && !ai.result.lines ? ai.result.ko : '';
  ai.last = $('#src').value.trim();
  status('');
  renderResult();
});
$('#sayJa').addEventListener('click', () => ai.result?.ja && speakAs(ai.result.ja, 'ja-JP'));

// 말하기: 녹음한 소리를 AI가 받아 적고 번역한다.
// 브라우저 내장 음성 인식은 아이폰 홈 화면 앱 등에서 권한 창도 없이 실패해서 쓰지 않는다.
// 누르면 녹음 시작(마이크 권한 창). 말을 마치고 잠깐 조용하면 자동으로 끝내고 번역한다(버튼으로 직접 끝내도 됨). 최대 20초.
// 보내기 전에 앞뒤 침묵을 잘라내고 16kHz 모노 WAV로 보낸다.
const MAX_REC = 20;
const END_SILENCE = 1.2; // 말이 끝난 뒤 이만큼(초) 조용하면 끝
const recState = { on: false, ctx: null, stream: null, src: null, node: null, chunks: [], rate: 48000, timer: null, sec: 0, noise: 0, noiseN: 0, spoke: false, quiet: 0 };
const rmsOf = (a) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / a.length);
};
// 말소리로 볼 크기: 처음 0.3초로 잰 주변 소음의 3배 이상 (조용한 곳에서도 최소값은 둔다)
const speechLevel = () => Math.max(0.012, recState.noise * 3);
if (navigator.mediaDevices?.getUserMedia) $('#mic').hidden = false;

function micUi(on) {
  $('#mic').classList.toggle('on', on);
  $('#mic span').textContent = on ? `끝내기 ${recState.sec}초` : ai.from === 'ko' ? '말하기' : '상대 말 듣기';
  renderThem(on);
}

function cleanupRec() {
  clearInterval(recState.timer);
  recState.node?.disconnect();
  recState.src?.disconnect();
  recState.stream?.getTracks().forEach((t) => t.stop());
  recState.ctx?.close().catch(() => {});
  Object.assign(recState, { on: false, ctx: null, stream: null, src: null, node: null, timer: null });
  micUi(false);
}

async function startRec() {
  // 아이폰은 소리 처리를 누르는 순간에 시작해야 해서, 권한을 묻기 전에 먼저 만든다
  const Ctx = window.AudioContext || window.webkitAudioContext;
  recState.ctx = new Ctx();
  recState.on = true;
  try {
    recState.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    cleanupRec();
    return status(
      e.name === 'NotAllowedError'
        ? '마이크 권한이 꺼져 있어요. 브라우저나 휴대폰 설정에서 이 사이트의 마이크를 허용해 주세요.'
        : '마이크를 쓸 수 없어요. 키보드의 마이크 버튼으로 받아 적어도 돼요.',
      true,
    );
  }
  if (!recState.on) return cleanupRec(); // 권한 창이 떠 있는 동안 화면을 닫았으면
  await recState.ctx.resume().catch(() => {});
  recState.rate = recState.ctx.sampleRate;
  recState.chunks = [];
  recState.src = recState.ctx.createMediaStreamSource(recState.stream);
  recState.node = recState.ctx.createScriptProcessor(4096, 1, 1);
  Object.assign(recState, { noise: 0, noiseN: 0, spoke: false, quiet: 0 });
  recState.node.onaudioprocess = (e) => {
    const chunk = new Float32Array(e.inputBuffer.getChannelData(0));
    recState.chunks.push(chunk);
    const level = rmsOf(chunk);
    const dur = chunk.length / recState.rate;
    if (recState.noiseN * dur < 0.3) {
      recState.noise = (recState.noise * recState.noiseN + level) / ++recState.noiseN;
      return;
    }
    if (level > speechLevel()) {
      recState.spoke = true;
      recState.quiet = 0;
    } else if (recState.spoke && (recState.quiet += dur) >= END_SILENCE) {
      stopRec(true); // 말이 끝났다
    }
  };
  recState.src.connect(recState.node);
  recState.node.connect(recState.ctx.destination);
  recState.sec = 0;
  micUi(true);
  status(ai.from === 'ko' ? '한국어로 말해 주세요. 말이 끝나면 바로 번역해요' : '휴대폰을 상대에게 향해 주세요. 상대 말이 끝나면 바로 번역해요');
  recState.timer = setInterval(() => {
    recState.sec++;
    micUi(true);
    if (recState.sec >= MAX_REC) stopRec(true);
  }, 1000);
}

// 녹음 → 16kHz 모노 16비트 WAV (data URL)
function toWav(chunks, rate, level = 0) {
  // 앞뒤 침묵은 잘라낸다(앞뒤로 0.25초씩은 남김) → 보내는 양과 AI가 들을 양이 줄어든다
  if (level > 0) {
    const loud = chunks.map((c) => rmsOf(c) > level);
    const first = loud.indexOf(true);
    const last = loud.lastIndexOf(true);
    if (first >= 0) {
      const pad = Math.ceil((0.25 * rate) / (chunks[0]?.length || 4096));
      chunks = chunks.slice(Math.max(0, first - pad), last + 1 + pad);
    }
  }
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(len);
  let o = 0;
  for (const c of chunks) all.set(c, o), (o += c.length);
  const ratio = rate / 16000;
  const n = Math.floor(len / ratio);
  const pcm = new Int16Array(n);
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(len, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += all[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    sq += v * v;
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.byteLength);
  const dv = new DataView(buf);
  const str = (p, s) => [...s].forEach((ch, i) => dv.setUint8(p + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); dv.setUint32(4, 36 + pcm.byteLength, true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 16000, true); dv.setUint32(28, 32000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, pcm.byteLength, true);
  new Int16Array(buf, 44).set(pcm);
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { url: 'data:audio/wav;base64,' + btoa(bin), seconds: n / 16000, rms: Math.sqrt(sq / Math.max(1, n)) };
}

async function stopRec(send) {
  if (!recState.on) return;
  const chunks = recState.chunks;
  const rate = recState.rate;
  const level = recState.noiseN ? speechLevel() : 0;
  cleanupRec();
  if (!send) return status('');
  const wav = toWav(chunks, rate, level);
  if (wav.seconds < 0.6) return status('너무 짧아요. 말하기를 누르고 말한 뒤 끝내기를 눌러 주세요.', true);
  if (wav.rms < 0.003) return status('말소리가 들리지 않았어요. 휴대폰을 입 가까이 대고 다시 해 주세요.', true);
  const seq = ++ai.seq;
  const from = ai.from;
  status('알아듣는 중…');
  try {
    const d = await call({ audio: wav.url, from });
    if (seq !== ai.seq) return;
    if (d.empty) return status('잘 알아듣지 못했어요. 조금 더 또렷하게 다시 말해 주세요.', true);
    $('#src').value = from === 'ko' ? d.ko : d.ja;
    ai.last = $('#src').value.trim();
    showResult(d, from);
  } catch (e) {
    if (seq === ai.seq) status(e.message, true);
  }
}

$('#mic').addEventListener('click', () => (recState.on ? stopRec(true) : startRec()));

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
function openTrans() {
  $('#trans').showModal();
  history.pushState({ trans: 1 }, '');
  renderResult();
}
function closeTrans() {
  stopRec(false);
  sheet(false);
  if ($('#trans').open) $('#trans').close();
}
$('#transBtn').addEventListener('click', openTrans);
// 닫기 버튼·Esc는 기록을 되돌려서(popstate) 닫는다 → 휴대폰 뒤로가기와 같은 길
$('#trans').addEventListener('click', (e) => e.target.closest('[data-tclose]') && history.back());
$('#trans').addEventListener('cancel', (e) => {
  e.preventDefault();
  history.back();
});
addEventListener('popstate', () => $('#trans').open && closeTrans());
document.addEventListener('visibilitychange', () => document.hidden && stopRec(false));

renderDir();
renderResult();
micUi(false);

const data = await (await fetch('data.json')).json();
state.cats = data.cats;
state.items = data.items.map((it, i) => ({ ...it, _i: i, _hay: norm(`${it.ko}|${it.ja}|${it.read}|${it.note ?? ''}`) }));
$('#cats').innerHTML =
  `<button class="on" data-cat="all">전체</button>` + data.cats.map(([k, label]) => `<button data-cat="${k}">${label}</button>`).join('');
render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
