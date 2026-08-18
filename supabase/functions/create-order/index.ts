import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { corsHeaders } from "../_shared/cors.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const whatsapp = "5493413038668";
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
} catch (_) {
  // A missing or invalid key package keeps public requests closed.
}

function serviceKey() {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (typeof keys?.default === "string" && keys.default) return keys.default;
  } catch (_) {
    // Fall back to the standard secret below.
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

const db = createClient(url, serviceKey(), { auth: { autoRefreshToken: false, persistSession: false } });

function json(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(request) });
}

function requireTrustedClient(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  if (!allowedOrigins.has(origin)) throw new Error("ORIGIN_NOT_ALLOWED");
  const apiKey = request.headers.get("apikey") ?? "";
  if (!apiKey || !publishableKeys.has(apiKey)) throw new Error("INVALID_API_KEY");
}

function money(value: unknown) {
  return `$${Math.round(Number(value) || 0).toLocaleString("es-AR")}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Método no permitido." }, 405);

  try {
    requireTrustedClient(request);
    const body = await request.json();
    if (String(body.website ?? "").trim()) return json(request, { error: "Solicitud no válida." }, 400);

    let user = null;
    const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (token) {
      const { data, error } = await db.auth.getUser(token);
      if (error) return json(request, { error: "Tu sesión venció. Volvé a ingresar." }, 401);
      user = data.user;
    }

    const { data, error } = await db.rpc("create_web_order", {
      p_auth_user_id: user?.id ?? null,
      p_email: user?.email ?? String(body.email ?? ""),
      p_full_name: body.fullName,
      p_phone: body.phone,
      p_tracking_requested: body.trackingRequested === true,
      p_purchase_type: body.purchaseType,
      p_coupon_code: body.couponCode ?? "",
      p_items: body.items,
      p_fulfillment_type: body.fulfillmentType,
      p_shipping_address: body.shippingAddress ?? "",
      p_customer_note: body.customerNote ?? "",
      p_whatsapp_opt_in: body.whatsappOptIn === true,
    });
    if (error) throw new Error(error.message);

    const lines = (data.items ?? []).map((item: Record<string, unknown>) => {
      const variant = item.variant ? ` (${item.variant})` : "";
      return `- ${item.quantity} x ${item.name}${variant}`;
    }).join("\n");
    const priceType = body.purchaseType === "wholesale" ? "Mayorista" : "Minorista";
    const message = `*¡Nuevo pedido recibido!*\n\nGracias por comprar en Ithiel Bazar y Makeup.\nPedido #${data.orderNumber}\n\n${lines}\n*Total:* ${money(data.total)}\n*Precio:* ${priceType}\n\nEn breve te contactamos para continuar con tu compra.`;
    return json(request, { ok: true, orderId: data.id, orderNumber: data.orderNumber, total: data.total, whatsappUrl: `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}` }, 201);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "No se pudo crear el pedido.";
    if (message === "ORIGIN_NOT_ALLOWED") return json(request, { error: "Origen no permitido." }, 403);
    if (message === "INVALID_API_KEY") return json(request, { error: "Cliente no autorizado." }, 401);
    return json(request, { error: message.replace(/^.*?:\s*/, "") }, 400);
  }
});
