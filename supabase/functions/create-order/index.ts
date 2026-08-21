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
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 250_000) throw new Error("PAYLOAD_TOO_LARGE");
}

function money(value: unknown) {
  return `$${Math.round(Number(value) || 0).toLocaleString("es-AR")}`;
}

function businessError(message: string): string | null {
  const clean = message.replace(/^.*?:\s*/, "");
  const allowed = [
    "Tipo de compra no válido.", "Forma de entrega no válida.", "Ingresá la dirección de envío.",
    "El pedido no tiene productos válidos.", "El cupón no es válido o está vencido.",
    "Una cantidad del pedido no es válida.", "Uno de los productos ya no está disponible.", "La variante elegida ya no está disponible.",
  ];
  if (allowed.some((text) => clean.includes(text))) return clean;
  if (/^No hay stock suficiente de /.test(clean) || /^Elegí color o talle para /.test(clean)) return clean;
  if (/^El producto .* no tiene precios? válidos?\./.test(clean) || /^Compra mayorista mínima: /.test(clean)) return clean;
  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Método no permitido." }, 405);

  try {
    requireTrustedClient(request);
    let body: Record<string, any>;
    try { body = await request.json(); } catch (_) { return json(request, { error: "Solicitud JSON no válida." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(request, { error: "Solicitud no válida." }, 400);
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
    if (error) {
      console.error("create_web_order failed", error);
      const expected = businessError(error.message ?? "");
      return expected ? json(request, { error: expected }, 400) : json(request, { error: "No se pudo crear el pedido. Probá nuevamente." }, 500);
    }

    const lines = (data.items ?? []).map((item: Record<string, unknown>) => {
      const variant = item.variant ? ` (${item.variant})` : "";
      return `- ${item.quantity} x ${item.name}${variant} | ${money(item.retailUnitPrice)} | ${money(item.wholesaleUnitPrice)}`;
    }).join("\n");
    const discount = Math.max(0, Number(data.subtotal ?? 0) - Number(data.total ?? 0));
    const message = `*Tu pedido es #${data.orderNumber}*\n\n*Item | Minorista | Mayorista*\n${lines}\n\nSubtotal minorista: ${money(data.retailSubtotal)}\nSubtotal mayorista: ${money(data.wholesaleSubtotal)}\nDescuento: ${money(discount)}\n*Total: ${money(data.total)}*\n\nEn breve te respondemos para continuar con tu compra.`;
    return json(request, { ok: true, orderId: data.id, orderNumber: data.orderNumber, total: data.total, wholesaleRule: data.wholesaleRule ?? null, whatsappUrl: `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}` }, 201);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "";
    if (message === "ORIGIN_NOT_ALLOWED") return json(request, { error: "Origen no permitido." }, 403);
    if (message === "INVALID_API_KEY") return json(request, { error: "Cliente no autorizado." }, 401);
    if (message === "PAYLOAD_TOO_LARGE") return json(request, { error: "La solicitud es demasiado grande." }, 413);
    return json(request, { error: "No se pudo crear el pedido. Probá nuevamente." }, 500);
  }
});
