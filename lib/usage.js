/**
 * Per-request usage logging.
 *
 * Emits one JSON line per API request to stdout. In the Docker deployment
 * Promtail ships stdout to Loki (stream label container_name="natter"); the evt:"usage"
 * marker separates these from Next.js's own stdout. Query in Grafana with:
 *   {container_name="natter"} | json | evt="usage"
 *
 * "From where" comes free from Cloudflare: CF-Connecting-IP (real client IP)
 * and CF-IPCountry (ISO country), with X-Forwarded-For / X-Real-IP fallbacks.
 */

function clientIp(headers) {
  const xff = (headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return headers.get('cf-connecting-ip') || xff || headers.get('x-real-ip') || null;
}

/** Pure: build the usage record. `now` (ISO string/ms) makes ts deterministic. */
export function buildUsageLine({
  request,
  route,
  query = null,
  kind = null,
  picksCount = null,
  ok = true,
  ms = null,
  now,
}) {
  const headers = request.headers;
  return {
    evt: 'usage',
    ts: (now ? new Date(now) : new Date()).toISOString(),
    route,
    query,
    kind,
    picksCount,
    ok,
    ip: clientIp(headers),
    country: headers.get('cf-ipcountry') || null,
    ua: headers.get('user-agent') || null,
    ms,
  };
}

/** Emit one usage line to stdout. Never throws — logging must not break a request. */
export function logUsage(args) {
  try {
    console.log(JSON.stringify(buildUsageLine(args)));
  } catch {
    // swallow — a logging failure must never affect the response
  }
}
