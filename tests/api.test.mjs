// API 오류 처리 테스트: AI 서버 오류·무응답·이상한 답, 사용량 한도, 잘못된 요청, 환율 서버 장애.
// 실제 AI·환율 서버는 부르지 않는다(fetch를 가짜로 바꿈). API 키도 필요 없다.
// 사용: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

// 모듈을 불러오기 전에 설정: 가짜 키, 짧은 대기 시간, 작은 한도
process.env.GEMINI_API_KEY = 'test-key';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.VISION_PROVIDER;
process.env.AI_TIMEOUT_MS = '800';
process.env.TRANSLATE_PER_MINUTE = '3';
process.env.TRANSLATE_PER_DAY = '1000';
process.env.TRANSLATE_ALL_PER_DAY = '1000';
process.env.IDENTIFY_PER_MINUTE = '2';

const realFetch = globalThis.fetch;
let fake; // (url, init) => Promise<Response> — 테스트마다 정한다
let calls = 0;
globalThis.fetch = (url, init) => {
  calls++;
  return fake(String(url), init);
};
beforeEach(() => {
  calls = 0;
});

const { default: translate } = await import('../api/translate.js');
const { default: identify } = await import('../api/identify.js');
const { default: rate } = await import('../api/rate.js');

// AI 서버(Gemini) 응답 흉내
const gemini = (text) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
const hang = (init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));

let ipSeq = 0;
async function call(handler, body, { method = 'POST', ip = `10.0.0.${++ipSeq}`, raw } = {}) {
  const req = Readable.from(raw !== undefined ? [Buffer.from(raw)] : body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, headers: { 'x-real-ip': ip }, socket: { remoteAddress: ip } });
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  const t = Date.now();
  await handler(req, res);
  return { status: res.statusCode, json: JSON.parse(res.body), ms: Date.now() - t };
}
const IMG = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg').toString('base64');

// ── 번역: 정상 ──
test('번역(글): 정상 응답은 ja·read·ko 를 돌려준다', async () => {
  fake = async () => gemini('{"ja":"免税できますか？","read":"멘제- 데키마스카?","ko":"면세 되나요?"}');
  const r = await call(translate, { text: '면세 되나요?', from: 'ko' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ja: '免税できますか？', read: '멘제- 데키마스카?', ko: '면세 되나요?' });
});

test('번역(사진): 줄 목록은 최대 40줄, 빈 줄은 뺀다', async () => {
  const lines = Array.from({ length: 50 }, (_, i) => ({ ja: `品${i}`, ko: `물건${i}` }));
  lines.splice(3, 0, { ja: '', ko: '' }, { foo: 1 });
  fake = async () => gemini(JSON.stringify({ summary: '메뉴판', lines }));
  const r = await call(translate, { image: IMG });
  assert.equal(r.status, 200);
  assert.equal(r.json.lines.length, 40);
  assert.ok(r.json.lines.every((l) => l.ja && l.ko));
});

// ── 번역: AI 서버 문제 ──
test('AI 서버가 500이면 한 번 더 시도하고, 둘 다 실패하면 502와 안내 문구', async () => {
  fake = async () => new Response('err', { status: 500 });
  const r = await call(translate, { text: '안녕하세요', from: 'ko' });
  assert.equal(r.status, 502);
  assert.equal(calls, 2);
  assert.match(r.json.error, /번역 서버에 잠시 문제가 있어요/);
  assert.doesNotMatch(r.json.error, /Gemini|500/, '내부 코드는 사용자에게 보이지 않는다');
});

test('AI 서버 사용량 초과(429)는 "사용량이 몰려 있어요"', async () => {
  fake = async () => new Response('quota', { status: 429 });
  const r = await call(translate, { text: '안녕하세요', from: 'ko' });
  assert.equal(r.status, 502);
  assert.match(r.json.error, /사용량이 몰려 있어요/);
});

test('AI 서버에 연결이 안 되면 502 "연결하지 못했어요"', async () => {
  fake = async () => {
    throw new TypeError('fetch failed');
  };
  const r = await call(translate, { text: '안녕하세요', from: 'ko' });
  assert.equal(r.status, 502);
  assert.match(r.json.error, /연결하지 못했어요/);
});

test('AI 서버가 응답이 없으면 제한 시간 뒤 502 (무한 대기 없음)', async () => {
  fake = (url, init) => hang(init);
  const r = await call(translate, { text: '안녕하세요', from: 'ko' });
  assert.equal(r.status, 502);
  assert.equal(calls, 2);
  assert.ok(r.ms < 3000, `${r.ms}ms 걸림`);
});

test('첫 요청이 늦어도 다시 보낸 요청이 먼저 오면 그 답을 쓴다', async () => {
  let n = 0;
  fake = (url, init) => (++n === 1 ? hang(init) : Promise.resolve(gemini('{"ja":"はい","read":"하이","ko":"네"}')));
  const r = await call(translate, { text: '네', from: 'ko' });
  assert.equal(r.status, 200);
  assert.equal(r.json.ja, 'はい');
});

test('AI가 JSON이 아닌 답을 주면 502 "번역하지 못했어요"', async () => {
  fake = async () => gemini('죄송합니다, 번역할 수 없습니다.');
  const r = await call(translate, { text: '안녕하세요', from: 'ko' });
  assert.equal(r.status, 502);
  assert.match(r.json.error, /번역하지 못했어요/);
});

test('AI 답에 ja나 ko가 비어 있으면 502', async () => {
  fake = async () => gemini('{"ja":"","read":"","ko":"안녕"}');
  const r = await call(translate, { text: '안녕', from: 'ko' });
  assert.equal(r.status, 502);
});

test('AI가 빈 답(후보 없음)을 주면 502', async () => {
  fake = async () => new Response('{}', { status: 200 });
  const r = await call(translate, { image: IMG });
  assert.equal(r.status, 502);
  assert.match(r.json.error, /사진을 읽지 못했어요/);
});

// ── 번역: 말(녹음) ──
const WAV = 'data:audio/wav;base64,' + Buffer.from('RIFF....WAVEfmt ').toString('base64');
test('말 번역: 녹음을 보내면 ja·read·ko, AI에는 audio/wav로 보낸다', async () => {
  let sent;
  fake = async (url, init) => {
    sent = JSON.parse(init.body);
    return gemini('{"ja":"トイレはどこですか","read":"토이레와 도코데스카","ko":"화장실 어디예요"}');
  };
  const r = await call(translate, { audio: WAV, from: 'ko' });
  assert.equal(r.status, 200);
  assert.equal(r.json.ja, 'トイレはどこですか');
  assert.equal(sent.contents[0].parts[0].inline_data.mime_type, 'audio/wav');
});

test('말 번역: 말소리가 없으면 empty', async () => {
  fake = async () => gemini('{"empty": true}');
  const r = await call(translate, { audio: WAV, from: 'ja' });
  assert.equal(r.status, 200);
  assert.equal(r.json.empty, true);
});

test('말 번역: wav가 아닌 녹음은 400, AI를 부르지 않음', async () => {
  fake = async () => assert.fail('AI를 부르면 안 됨');
  assert.equal((await call(translate, { audio: 'data:audio/webm;base64,aGk=' })).status, 400);
});

test('말 번역: 두 번 다 알아듣지 못한 답이면 502 안내', async () => {
  fake = async () => gemini('음...');
  const r = await call(translate, { audio: WAV, from: 'ko' });
  assert.equal(r.status, 502);
  assert.equal(calls, 2);
  assert.match(r.json.error, /알아듣지 못했어요/);
});

test('이상한 답이 한 번 오면 다시 물어서 성공한다', async () => {
  let n = 0;
  fake = async () => (++n === 1 ? gemini('') : gemini('{"ja":"はい","read":"하이","ko":"네"}'));
  const r = await call(translate, { audio: WAV, from: 'ko' });
  assert.equal(r.status, 200);
  assert.equal(r.json.ja, 'はい');
});

test('말 번역: 무음 녹음을 AI가 400으로 거절하면 "알아듣지 못했어요"', async () => {
  fake = async () => new Response('bad audio', { status: 400 });
  const r = await call(translate, { audio: WAV, from: 'ja' });
  assert.equal(r.status, 502);
  assert.match(r.json.error, /알아듣지 못했어요/);
});

// ── 번역: 잘못된 요청 ──
test('잘못된 요청은 AI를 부르지 않고 400', async () => {
  fake = async () => assert.fail('AI를 부르면 안 됨');
  assert.equal((await call(translate, { text: '   ' })).status, 400);
  assert.equal((await call(translate, { image: 'data:text/plain;base64,aGk=' })).status, 400);
  assert.equal((await call(translate, undefined, { raw: '{깨진 json' })).status, 400);
  assert.equal((await call(translate, undefined, { method: 'GET' })).status, 405);
  assert.equal(calls, 0);
});

test('너무 큰 사진은 413', async () => {
  fake = async () => assert.fail('AI를 부르면 안 됨');
  const r = await call(translate, undefined, { raw: JSON.stringify({ image: 'data:image/jpeg;base64,' + 'A'.repeat(7 * 1024 * 1024) }) });
  assert.equal(r.status, 413);
});

test('글은 300자까지만 보낸다', async () => {
  let sent = '';
  fake = async (url, init) => {
    sent = init.body;
    return gemini('{"ja":"あ","read":"아","ko":"가"}');
  };
  await call(translate, { text: '가'.repeat(1000), from: 'ko' });
  assert.ok(!sent.includes('가'.repeat(301)));
});

// ── 사용량 한도 ──
test('번역 한도: 같은 사람이 1분에 3번 넘게 부르면 429와 안내 문구, 다른 사람은 영향 없음', async () => {
  fake = async () => gemini('{"ja":"あ","read":"아","ko":"가"}');
  const ip = '192.168.0.77';
  for (let i = 0; i < 3; i++) assert.equal((await call(translate, { text: '가', from: 'ko' }, { ip })).status, 200);
  const r = await call(translate, { text: '가', from: 'ko' }, { ip });
  assert.equal(r.status, 429);
  assert.match(r.json.error, /1분에 20번까지|잠시 후/);
  assert.equal((await call(translate, { text: '가', from: 'ko' }, { ip: '192.168.0.78' })).status, 200);
});

test('잘못된 요청은 한도에 세지 않는다', async () => {
  fake = async () => gemini('{"ja":"あ","read":"아","ko":"가"}');
  const ip = '192.168.0.90';
  for (let i = 0; i < 5; i++) await call(translate, { text: '' }, { ip });
  assert.equal((await call(translate, { text: '가', from: 'ko' }, { ip })).status, 200);
});

test('사진 인식 한도: 1분에 2번 넘으면 429 (AI를 부르지 않음)', async () => {
  fake = async () => gemini('{"id":null,"name":"x"}');
  const ip = '192.168.1.1';
  await call(identify, { image: IMG }, { ip });
  await call(identify, { image: IMG }, { ip });
  calls = 0;
  const r = await call(identify, { image: IMG }, { ip });
  assert.equal(r.status, 429);
  assert.equal(calls, 0);
});

// ── 사진 인식 ──
test('사진 인식: AI 서버 오류는 502 "인식 서버"', async () => {
  fake = async () => new Response('x', { status: 503 });
  const r = await call(identify, { image: IMG });
  assert.equal(r.status, 502);
  assert.match(r.json.error, /인식 서버/);
});

test('사진 인식: 목록에 없는 id는 null로', async () => {
  fake = async () => gemini('{"id":"no-such-bottle","name":"Mystery"}');
  const r = await call(identify, { image: IMG });
  assert.equal(r.status, 200);
  assert.equal(r.json.id, null);
  assert.equal(r.json.name, 'Mystery');
});

// ── 키가 없을 때 ──
test('API 키가 없으면 503과 안내 문구', async () => {
  const key = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    assert.equal((await call(translate, { text: '가', from: 'ko' })).status, 503);
    assert.equal((await call(identify, { image: IMG })).status, 503);
  } finally {
    process.env.GEMINI_API_KEY = key;
  }
});

// ── 환율 ──
test('환율 서버가 죽어 있으면 기본값(live:false)으로 답한다', async () => {
  fake = async () => {
    throw new TypeError('fetch failed');
  };
  const r = await call(rate, undefined, { method: 'GET' });
  assert.equal(r.status, 200);
  assert.equal(r.json.live, false);
  assert.ok(r.json.krwPerJpy > 0);
});

test('환율 서버가 이상한 답을 줘도 기본값으로 답한다', async () => {
  fake = async () => new Response('<html>502</html>', { status: 502 });
  const r = await call(rate, undefined, { method: 'GET' });
  assert.equal(r.json.live, false);
});

test('환율 서버 정상: live:true, 이후 서버가 죽어도 받아 둔 값을 쓴다', async () => {
  fake = async () => new Response(JSON.stringify({ result: 'success', rates: { KRW: 9.1, USD: 0.0066 }, time_last_update_utc: 'x' }));
  assert.equal((await call(rate, undefined, { method: 'GET' })).json.krwPerJpy, 9.1);
  fake = async () => {
    throw new TypeError('fetch failed');
  };
  const r = await call(rate, undefined, { method: 'GET' });
  assert.equal(r.json.live, true);
  assert.equal(r.json.krwPerJpy, 9.1);
});

process.on('exit', () => (globalThis.fetch = realFetch));
