import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

// Pretty-print JSON when `?pretty=1` or `x-pretty: 1` is supplied; otherwise
// return standard compact JSON. Keeps humans and programs happy.
export function jsonRespond(c: Context, data: unknown, status: ContentfulStatusCode = 200) {
  const pretty = c.req.query('pretty') ?? c.req.header('x-pretty');
  if (pretty) {
    const body = JSON.stringify(data, null, 2);
    return new Response(body, { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
  return c.json(data, { status });
}


