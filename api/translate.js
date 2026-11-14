// 보여주는 일본어(talk/)의 AI 번역.
// 글: { text, from: 'ko' | 'ja' } → { ja, read, ko }  (일본어 문장, 그 한글 발음, 한국어 문장 — 회화 카드와 같은 형식)
// 사진: { image: dataURL } → { summary, lines: [{ ja, ko }] }  (메뉴판·안내문·라벨 등)
// 말: { audio: 'data:audio/wav;base64,...', from } → { ja, read, ko } 또는 { empty: true } (말소리가 없을 때)
//   브라우저 내장 음성 인식은 아이폰 홈 화면 앱 등에서 안 돼서, 녹음한 소리를 AI가 받아 적고 번역한다(Gemini만).
import { send, readJson } from '../lib/http.js';
import { ProviderError, pickProvider, parseJson, createLimiter, clientIp, parseImage } from '../lib/ai.js';

const MAX_TEXT = 300;
const parseAudio = (s) => {
  const m = /^data:(audio\/wav);base64,(.+)$/.exec(s ?? '');
  return m ? { mime: m[1], data: m[2] } : null;
};

const AUDIO_PROMPT = (from) => `당신은 일본을 여행하는 한국인을 돕는 통역사입니다.
녹음은 ${from === 'ja' ? '일본 사람(점원·직원 등)이 일본어로 한 말' : '한국인 여행자가 한국어로 한 말'}입니다. 먼저 정확히 받아 적고 번역하세요.
${
  from === 'ja'
    ? 'ja에는 받아 적은 일본어, ko에는 자연스러운 한국어 번역을 넣으세요.'
    : 'ko에는 받아 적은 한국어(맞춤법만 다듬기), ja에는 점원·직원에게 보여 줄 정중하고 자연스러운 일본어(です・ます체)를 넣으세요.'
}
read에는 ja 문장을 한국인이 그대로 소리 내 읽을 수 있게 한글로 적으세요. 장음은 '-'로 표시하세요.
말소리가 없거나 알아들을 수 없으면 {"empty": true} 만 출력하세요.
JSON 한 줄만 출력하세요: {"ja": "...", "read": "...", "ko": "..."}`;

const TEXT_PROMPT = (text, from) => `당신은 일본을 여행하는 한국인을 돕는 통역사입니다.
${
  from === 'ja'
    ? '아래 입력은 일본 사람(점원·직원 등)이 한 말이나 일본어 글입니다. 자연스러운 한국어로 번역하세요. ja에는 입력을 그대로 넣으세요(음성 인식 오류로 보이는 부분만 바로잡기).'
    : '아래 입력은 한국인 여행자가 일본 사람에게 하고 싶은 말입니다. 점원·직원에게 보여 줄 정중하고 자연스러운 일본어(です・ます체)로 번역하세요. ko에는 입력을 맞춤법만 다듬어 넣으세요.'
}
read에는 ja 문장을 한국인이 그대로 소리 내 읽을 수 있게 한글로 적으세요. 장음은 '-'로 표시하세요 (예: 免税できますか？ → 멘제- 데키마스카?).
JSON 한 줄만 출력하세요: {"ja": "...", "read": "...", "ko": "..."}

입력:
${text}`;

const IMAGE_PROMPT = `당신은 일본을 여행하는 한국인을 돕는 통역사입니다.
사진 속 일본어(메뉴판, 안내문, 간판, 상품 라벨, 영수증, 표지판 등)를 읽고 한국어로 번역하세요.
- 의미 단위로 나눠 lines에 넣으세요. 메뉴는 '음식 이름 + 가격'을 한 줄로, 가격과 숫자는 원문 그대로.
- 위에서 아래, 왼쪽에서 오른쪽 순서로. 같은 내용 반복이나 의미 없는 장식 글자는 빼세요. 최대 40줄.
- summary에는 이 사진이 무엇인지 한 문장으로 (예: "라멘집 메뉴판이에요. 토핑은 별도 요금이에요.").
- 일본어 글자가 없으면 lines는 빈 배열, summary에 그 이유를 적으세요.
JSON만 출력하세요: {"summary": "...", "lines": [{"ja": "원문", "ko": "번역"}]}`;

// 글 번역은 입력할 때마다 부를 수 있어서 사진 인식보다 넉넉하게 잡는다
const overLimit = createLimiter({
  perMinute: Number(process.env.TRANSLATE_PER_MINUTE) || 20,
  perDay: Number(process.env.TRANSLATE_PER_DAY) || 300,
  allPerDay: Number(process.env.TRANSLATE_ALL_PER_DAY) || 3000,
  messages: {
    all: '오늘 번역 사용량이 다 찼어요. 아래 문장 목록을 이용해 주세요.',
    day: '오늘 번역을 너무 많이 썼어요. 아래 문장 목록을 이용해 주세요.',
    minute: '잠시 후 다시 해 주세요 (1분에 20번까지).',
  },
});

const str = (v) => (typeof v === 'string' ? v.trim() : '');

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST만 지원해요.' });
  const provider = pickProvider();
  if (!provider) return send(res, 503, { error: '번역이 설정되지 않았어요 (API 키 없음).' });

  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return e.message === 'too large' ? send(res, 413, { error: body?.audio ? '녹음이 너무 길어요.' : '사진이 너무 커요.' }) : send(res, 400, { error: '요청 형식이 잘못됐어요.' });
  }
  const image = body?.image ? parseImage(body.image) : null;
  const audio = body?.audio ? parseAudio(body.audio) : null;
  const text = str(body?.text).slice(0, MAX_TEXT);
  const from = body?.from === 'ja' ? 'ja' : 'ko';
  if (body?.image && !image) return send(res, 400, { error: '이미지 형식이 올바르지 않아요.' });
  if (body?.audio && !audio) return send(res, 400, { error: '녹음 형식이 올바르지 않아요.' });
  if (!image && !audio && !text) return send(res, 400, { error: '번역할 내용이 없어요.' });
  if (audio && provider.key !== 'GEMINI_API_KEY') return send(res, 503, { error: '말로 번역하기는 지금 쓸 수 없어요. 글로 적어 주세요.' });

  const limited = overLimit(clientIp(req));
  if (limited) return send(res, 429, { error: limited });

  let out;
  try {
    const raw = image
      ? await provider.call(provider.apiKey, { prompt: IMAGE_PROMPT, image, maxTokens: 2500 })
      : audio
        ? await provider.call(provider.apiKey, { prompt: AUDIO_PROMPT(from), image: audio, maxTokens: 500 })
        : await provider.call(provider.apiKey, { prompt: TEXT_PROMPT(text, from), maxTokens: 400, hedgeDelay: 4000 });
    out = parseJson(raw);
  } catch (e) {
    console.error('translate:', e.message);
    return send(res, 502, { error: e instanceof ProviderError ? e.friendly('번역 서버') : '번역 서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.' });
  }
  if (!out) return send(res, 502, { error: image ? '사진을 읽지 못했어요. 글자가 잘 보이게 다시 찍어 주세요.' : audio ? '잘 알아듣지 못했어요. 조금 더 가까이에서 다시 말해 주세요.' : '번역하지 못했어요. 다시 해 주세요.' });
  if (audio && out.empty) return send(res, 200, { empty: true });

  if (image) {
    const lines = (Array.isArray(out.lines) ? out.lines : [])
      .map((l) => ({ ja: str(l?.ja), ko: str(l?.ko) }))
      .filter((l) => l.ja || l.ko)
      .slice(0, 40);
    return send(res, 200, { summary: str(out.summary), lines });
  }
  const result = { ja: str(out.ja), read: str(out.read), ko: str(out.ko) };
  if (!result.ja || !result.ko) return send(res, 502, { error: '번역하지 못했어요. 다시 해 주세요.' });
  send(res, 200, result);
}
