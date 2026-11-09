export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

// Vercel은 req.body를 미리 파싱해 주고, 로컬 서버는 직접 읽는다.
export async function readJson(req, limit = 6 * 1024 * 1024) {
  if (req.body !== undefined) return req.body;
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
}
