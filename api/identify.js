import whiskies from '../liquor/whiskies.json' with { type: 'json' };
import { send, readJson } from '../lib/http.js';
import { ProviderError, pickProvider, parseJson, createLimiter, clientIp, parseImage } from '../lib/ai.js';

const CATALOG = whiskies.map((w) => `${w.id}: ${w.en}`).join('\n');
const PROMPT = `사진 속 술병(위스키, 사케, 소주, 우메슈, 와인·샴페인 등)의 라벨을 읽고, 아래 목록에서 정확히 같은 제품의 id를 고르세요.
숙성 연수(12년, NV 등)와 캐스크/에디션까지 일치해야 합니다. 와인은 빈티지 연도는 달라도 같은 제품이면 됩니다. 일치하는 게 없으면 id는 null.
JSON 한 줄만 출력하세요: {"id": "<id 또는 null>", "name": "<라벨에 적힌 제품명(영어 또는 일본어)>"}

목록:
${CATALOG}`;

// 남이 API를 반복 호출해 Gemini 무료 한도(하루 1,500회)를 다 쓰지 않게 막는다.
// 인식 한 번에 Gemini를 최대 2번 부르므로(hedge) 전체 하루 한도는 그 절반 아래로 잡는다.
const overLimit = createLimiter({
  perMinute: Number(process.env.IDENTIFY_PER_MINUTE) || 6,
  perDay: Number(process.env.IDENTIFY_PER_DAY) || 60,
  allPerDay: Number(process.env.IDENTIFY_ALL_PER_DAY) || 600,
  messages: {
    all: '오늘 사진 인식 사용량이 다 찼어요. 이름으로 검색해 주세요.',
    day: '오늘 사진 인식을 너무 많이 썼어요. 이름으로 검색해 주세요.',
    minute: '잠시 후 다시 찍어 주세요 (1분에 6번까지).',
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST만 지원해요.' });
  const provider = pickProvider();
  if (!provider) return send(res, 503, { error: '사진 인식이 설정되지 않았어요 (API 키 없음). 이름으로 검색해 주세요.' });
  const limited = overLimit(clientIp(req));
  if (limited) return send(res, 429, { error: limited });

  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return e.message === 'too large' ? send(res, 413, { error: '사진이 너무 커요.' }) : send(res, 400, { error: '요청 형식이 잘못됐어요.' });
  }
  const image = parseImage(body?.image);
  if (!image) return send(res, 400, { error: '이미지 형식이 올바르지 않아요.' });

  let text;
  try {
    text = await provider.call(provider.apiKey, { prompt: PROMPT, image, maxTokens: 200 });
  } catch (e) {
    console.error('identify:', e.message);
    return send(res, 502, { error: e instanceof ProviderError ? e.friendly('인식 서버') : '인식 서버에 연결하지 못했어요. 이름으로 검색해 주세요.' });
  }

  const out = parseJson(text);
  if (!out) return send(res, 502, { error: '라벨을 읽지 못했어요. 라벨이 잘 보이게 다시 찍어 주세요.' });
  const id = whiskies.some((w) => w.id === out.id) ? out.id : null;
  send(res, 200, { id, name: typeof out.name === 'string' ? out.name : null, model: provider.model });
}
