// 사진 인식(api/identify)과 번역(api/translate)이 같이 쓰는 AI 호출·사용량 제한.

// AI 서버가 오류로 답했을 때. 사용자에게는 friendly(이름)으로 안내하고, 상세(서버·상태 코드)는 서버 기록에만 남긴다.
export class ProviderError extends Error {
  constructor(provider, status) {
    super(`${provider} ${status}`);
    this.status = status;
  }
  friendly(name) {
    return this.status === 429 ? `${name} 사용량이 몰려 있어요. 잠시 뒤 다시 해 주세요.` : `${name}에 잠시 문제가 있어요. 잠시 뒤 다시 해 주세요.`;
  }
}

// AI 요청 하나를 기다리는 최대 시간. 재시도까지 합쳐도 화면 쪽 제한(40초)보다 짧아야 한다.
const TIMEOUT = Number(process.env.AI_TIMEOUT_MS) || 25000;

// fn을 실행하고, delay 안에 답이 없거나 실패하면 같은 요청을 한 번 더 보내 먼저 성공한 결과를 쓴다.
// 둘 다 실패하면 마지막 에러. 끝나면 남은 요청은 취소한다.
export function hedge(fn, delay = 6000, timeout = TIMEOUT) {
  const ctrls = [];
  return new Promise((resolve, reject) => {
    let pending = 0;
    const finish = (v) => {
      clearTimeout(timer);
      ctrls.forEach((c) => c.abort());
      resolve(v);
    };
    const launch = () => {
      const c = new AbortController();
      ctrls.push(c);
      pending++;
      fn(AbortSignal.any([c.signal, AbortSignal.timeout(timeout)])).then(finish, (e) => {
        if (--pending > 0) return;
        if (ctrls.length < 2) launch();
        else reject(e);
      });
    };
    const timer = setTimeout(() => ctrls.length < 2 && launch(), delay);
    launch();
  });
}

// 각 provider는 { prompt, image?: { mime, data }, maxTokens } → 모델이 출력한 텍스트를 돌려준다.
const PROVIDERS = {
  gemini: {
    key: 'GEMINI_API_KEY',
    model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    async call(key, { prompt, image, maxTokens = 200, hedgeDelay = 6000 }) {
      const thinking = process.env.GEMINI_THINKING ?? 'minimal';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
      const body = JSON.stringify({
        contents: [{ parts: [...(image ? [{ inline_data: { mime_type: image.mime, data: image.data } }] : []), { text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: maxTokens,
          // 라벨 읽기·번역에 긴 추론은 필요 없다
          ...(thinking && { thinkingConfig: { thinkingLevel: thinking } }),
        },
      });
      // 같은 요청이 보통 2초인데 가끔 20~40초 걸려서(실측), 늦으면 하나 더 보내 먼저 온 답을 쓴다
      return hedge(async (signal) => {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
          body,
          signal,
        });
        if (!r.ok) throw new ProviderError('Gemini', r.status);
        const d = await r.json();
        return d.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('') ?? '';
      }, hedgeDelay);
    },
  },
  claude: {
    key: 'ANTHROPIC_API_KEY',
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    async call(key, { prompt, image, maxTokens = 200 }) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          messages: [
            {
              role: 'user',
              content: [...(image ? [{ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data } }] : []), { type: 'text', text: prompt }],
            },
          ],
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (!r.ok) throw new ProviderError('Claude', r.status);
      const d = await r.json();
      return d.content?.find((c) => c.type === 'text')?.text ?? '';
    },
  },
};

// VISION_PROVIDER로 고정하거나, 없으면 키가 있는 쪽을 쓴다 (Gemini 우선).
export function pickProvider() {
  const name = process.env.VISION_PROVIDER || ['gemini', 'claude'].find((n) => process.env[PROVIDERS[n].key]);
  const p = PROVIDERS[name];
  return p && process.env[p.key] ? { ...p, apiKey: process.env[p.key] } : null;
}

// 모델 출력에서 JSON 객체만 꺼낸다. 못 꺼내면 null.
export function parseJson(text) {
  try {
    return JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
  } catch {
    return null;
  }
}

// 남이 API를 반복 호출해 무료 한도를 다 쓰지 않게 막는 사용량 제한. 메모리에만 저장해서 서버를 재시작하면 초기화된다.
// overLimit(ip) → 넘었으면 안내 문구, 아니면 null(그리고 1회 사용으로 센다)
export function createLimiter({ perMinute, perDay, allPerDay, messages }) {
  let usage = { day: '', all: 0, byIp: new Map() };
  return function overLimit(ip) {
    const day = new Date().toISOString().slice(0, 10);
    if (usage.day !== day) usage = { day, all: 0, byIp: new Map() };
    const now = Date.now();
    const u = usage.byIp.get(ip) ?? { day: 0, recent: [] };
    u.recent = u.recent.filter((t) => now - t < 60_000);
    if (usage.all >= allPerDay) return messages.all;
    if (u.day >= perDay) return messages.day;
    if (u.recent.length >= perMinute) return messages.minute;
    u.day++;
    u.recent.push(now);
    usage.all++;
    usage.byIp.set(ip, u);
    return null;
  };
}

// nginx가 실제 접속 IP를 X-Real-IP로 넘겨준다. 앱 서버는 127.0.0.1에서만 열려 있어 위조할 수 없다.
export const clientIp = (req) => req.headers['x-real-ip'] ?? req.socket.remoteAddress;

// data:image/...;base64,... → { mime, data } (형식이 다르면 null)
export function parseImage(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(dataUrl ?? '');
  return m ? { mime: m[1], data: m[2] } : null;
}
