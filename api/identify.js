import whiskies from '../public/whiskies.json' with { type: 'json' };
import { send, readJson } from '../lib/http.js';

const CATALOG = whiskies.map((w) => `${w.id}: ${w.en}`).join('\n');
const PROMPT = `사진 속 술병(위스키, 사케, 소주, 우메슈 등)의 라벨을 읽고, 아래 목록에서 정확히 같은 제품의 id를 고르세요.
숙성 연수(12년, NV 등)와 캐스크/에디션까지 일치해야 합니다. 일치하는 게 없으면 id는 null.
JSON 한 줄만 출력하세요: {"id": "<id 또는 null>", "name": "<라벨에 적힌 제품명(영어 또는 일본어)>"}

목록:
${CATALOG}`;

class ProviderError extends Error {}

// 각 provider는 (mime, base64) → 모델이 출력한 텍스트를 돌려준다.
const PROVIDERS = {
  gemini: {
    key: 'GEMINI_API_KEY',
    model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    async call(key, mime, data) {
      const body = (thinking) => ({
        contents: [{ parts: [{ inline_data: { mime_type: mime, data } }, { text: PROMPT }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 200,
          ...(thinking && { thinkingConfig: { thinkingLevel: thinking } }),
        },
      });
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
      const post = (b) =>
        fetch(url, {
          method: 'POST',
          headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
          body: JSON.stringify(b),
          signal: AbortSignal.timeout(20000),
        });
      // 라벨 읽기에 긴 추론은 필요 없다. 모델이 이 thinking 값을 거부하면 기본값으로 재시도.
      const thinking = process.env.GEMINI_THINKING ?? 'minimal';
      let r = await post(body(thinking));
      if (r.status === 400 && thinking) r = await post(body(null));
      if (!r.ok) throw new ProviderError(`인식 서버 오류 (Gemini ${r.status})`);
      const d = await r.json();
      return d.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('') ?? '';
    },
  },
  claude: {
    key: 'ANTHROPIC_API_KEY',
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    async call(key, mime, data) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 200,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: mime, data } },
                { type: 'text', text: PROMPT },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new ProviderError(`인식 서버 오류 (Claude ${r.status})`);
      const d = await r.json();
      return d.content?.find((c) => c.type === 'text')?.text ?? '';
    },
  },
};

// VISION_PROVIDER로 고정하거나, 없으면 키가 있는 쪽을 쓴다 (Gemini 우선).
function pickProvider() {
  const name = process.env.VISION_PROVIDER || ['gemini', 'claude'].find((n) => process.env[PROVIDERS[n].key]);
  const p = PROVIDERS[name];
  return p && process.env[p.key] ? { ...p, apiKey: process.env[p.key] } : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST만 지원해요.' });
  const provider = pickProvider();
  if (!provider) return send(res, 503, { error: '사진 인식이 설정되지 않았어요 (API 키 없음). 이름으로 검색해 주세요.' });

  let body;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 413, { error: '사진이 너무 커요.' });
  }
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(body?.image ?? '');
  if (!m) return send(res, 400, { error: '이미지 형식이 올바르지 않아요.' });

  let text;
  try {
    text = await provider.call(provider.apiKey, m[1], m[2]);
  } catch (e) {
    return send(res, 502, { error: e instanceof ProviderError ? e.message : '인식 서버에 연결하지 못했어요.' });
  }

  let out;
  try {
    out = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
  } catch {
    return send(res, 502, { error: '라벨을 읽지 못했어요. 라벨이 잘 보이게 다시 찍어 주세요.' });
  }
  const id = whiskies.some((w) => w.id === out.id) ? out.id : null;
  send(res, 200, { id, name: typeof out.name === 'string' ? out.name : null, model: provider.model });
}
