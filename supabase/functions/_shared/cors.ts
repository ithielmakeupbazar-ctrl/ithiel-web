const allowedOrigins = new Set([
  "https://ithielbazarymakeup.site",
  "https://www.ithielbazarymakeup.site",
  "https://ithielbazar-makeup.netlify.app",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

export function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://ithielbazarymakeup.site",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}
