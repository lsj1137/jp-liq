import { send } from '../lib/http.js';

const TTL = 6 * 60 * 60 * 1000;
const FALLBACK_KRW_PER_JPY = 8.6;
let cache = null;

export default async function handler(req, res) {
  if (!cache || Date.now() - cache.at > TTL) {
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/JPY', { signal: AbortSignal.timeout(4000) });
      const d = await r.json();
      if (d.result === 'success' && d.rates?.KRW) {
        cache = { at: Date.now(), krwPerJpy: d.rates.KRW, updated: d.time_last_update_utc };
      }
    } catch {
      // 이전 캐시나 기본값으로 응답
    }
  }
  res.setHeader('cache-control', 'public, max-age=1800');
  if (cache) return send(res, 200, { krwPerJpy: cache.krwPerJpy, updated: cache.updated, live: true });
  send(res, 200, { krwPerJpy: FALLBACK_KRW_PER_JPY, live: false });
}
