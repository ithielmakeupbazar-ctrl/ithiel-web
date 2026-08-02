import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { corsHeaders } from "../_shared/cors.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const whatsapp = "5493413038668";

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

function money(value: unknown) {
  return `$${Math.round(Number(value) || 0).toLocaleString("es-AR")}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Método no permitido." }, 405);

  try {
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
      return `• ${item.quantity} x ${item.name}${variant} - ${money(item.unitPrice)}`;
    }).join("\n");
    const message = `Hola! Registré el pedido #${data.orderNumber}:\n\n${lines}\n\nTotal: ${money(data.total)}\nTipo: ${body.purchaseType === "wholesale" ? "Mayorista" : "Minorista"}.`;
    return json(request, { ok: true, orderId: data.id, orderNumber: data.orderNumber, total: data.total, whatsappUrl: `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}` }, 201);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "No se pudo crear el pedido.";
    return json(request, { error: message.replace(/^.*?:\s*/, "") }, 400);
  }
});
