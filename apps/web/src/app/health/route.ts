// Liveness cho HEALTHCHECK Docker / compose; ngoài matcher proxy (src/proxy.ts)
export function GET() {
  return Response.json({ status: 'ok' });
}
