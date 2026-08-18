import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const allowedOrigins = new Set([
  "https://ithielbazarymakeup.site",
  "https://www.ithielbazarymakeup.site",
  "https://ithielbazar-makeup.netlify.app",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const publishableKeys = new Set<string>();
try {
  const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
  for (const key of Object.values(keys)) {
    if (typeof key === "string" && key) publishableKeys.add(key);
  }
} catch (_) {}

function serviceKey() {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (typeof keys?.default === "string" && keys.default) return keys.default;
  } catch (_) {}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

const db = createClient(SUPABASE_URL, serviceKey(), {
  auth: { autoRefreshToken: false, persistSession: false },
});

function cors(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://ithielbazarymakeup.site",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors(request) });
}

function trusted(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const apiKey = request.headers.get("apikey") ?? "";
  return allowedOrigins.has(origin) && publishableKeys.has(apiKey);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors(request) });
  }
  if (request.method !== "POST") {
    return json(request, { error: "Método no permitido." }, 405);
  }
  if (!trusted(request)) {
    return json(request, { error: "Cliente no autorizado." }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch (_) {
    return json(request, { error: "Solicitud no válida." }, 400);
  }

  const code = String(body?.code ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .slice(0, 40);

  if (!code) {
    return json(request, { valid: false, error: "Ingresá un cupón." }, 400);
  }

  const { data, error } = await db
    .from("coupons")
    .select("code,discount_percent,starts_at,expires_at,active")
    .eq("code", code)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    console.error("validate-coupon query failed", error);
    return json(request, { error: "No se pudo validar el cupón." }, 500);
  }

  const now = Date.now();
  const startsAt = data?.starts_at ? new Date(data.starts_at).getTime() : null;
  const expiresAt = data?.expires_at ? new Date(data.expires_at).getTime() : null;
  const inWindow =
    Boolean(data) &&
    (startsAt === null || startsAt <= now) &&
    (expiresAt === null || expiresAt >= now);

  if (!data || !inWindow) {
    return json(
      request,
      { valid: false, error: "El cupón no es válido o está vencido." },
      200,
    );
  }

  const discountPercent = Math.max(
    0,
    Math.min(100, Number(data.discount_percent) || 0),
  );

  return json(request, {
    valid: true,
    code: data.code,
    discountPercent,
    expiresAt: data.expires_at,
  });
});
