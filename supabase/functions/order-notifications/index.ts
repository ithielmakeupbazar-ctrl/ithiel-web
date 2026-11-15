import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = (() => {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (typeof keys?.default === "string" && keys.default) return keys.default;
  } catch (_) {}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
})();

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function statusMessage(status: string, orderNumber: string | number) {
  const label = `Pedido #${orderNumber}`;
  if (status === "pending") return `${label}: recibimos tu pedido.`;
  if (status === "processing") return `${label}: ya está en preparación.`;
  if (status === "completed") return `${label}: ya está completado.`;
  if (status === "cancelled") return `${label}: fue cancelado.`;
  return `${label}: estado actualizado a ${status}.`;
}

async function currentUser(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("UNAUTHORIZED");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user?.id) throw new Error("UNAUTHORIZED");
  return data.user;
}

async function isAdmin(userId: string) {
  const { data, error } = await db.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function sendTelegram(message: string) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const rawIds = Deno.env.get("TELEGRAM_ALLOWED_USER_IDS") ?? "";
  const ids = rawIds.split(",").map((v) => v.trim()).filter(Boolean);
  if (!token || !ids.length) return { sent: 0, configured: false };

  let sent = 0;
  for (const chatId of ids) {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
    if (response.ok) sent += 1;
  }
  return { sent, configured: true };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Método no permitido" }, { status: 405 });
  }

  try {
    const user = await currentUser(req);
    const body = await req.json().catch(() => ({}));
    const orderId = String(body.orderId ?? "").trim();
    const notifyAdmin = body.notifyAdmin === true;
    if (!orderId) return Response.json({ error: "Falta orderId." }, { status: 400 });

    const { data: order, error } = await db
      .from("orders")
      .select("id,order_number,status,purchase_type,fulfillment_type,total,item_count,created_at,customer_id,customers(id,auth_user_id,full_name,phone,email,whatsapp_opt_in),order_items(product_name,variant_name,quantity,line_total)")
      .eq("id", orderId)
      .maybeSingle();

    if (error) throw error;
    if (!order) return Response.json({ error: "Pedido no encontrado." }, { status: 404 });

    const admin = await isAdmin(user.id);
    const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
    const ownsOrder = Boolean(customer?.auth_user_id && customer.auth_user_id === user.id);

    if (!admin && !ownsOrder) {
      return Response.json({ error: "No autorizado para consultar este pedido." }, { status: 403 });
    }

    const message = statusMessage(order.status, order.order_number);
    let telegram = { sent: 0, configured: Boolean(Deno.env.get("TELEGRAM_BOT_TOKEN")) };
    if (notifyAdmin) {
      if (!admin) return Response.json({ error: "Solo un administrador puede notificar al equipo." }, { status: 403 });
      telegram = await sendTelegram(`🧾 ${message}\nCliente: ${customer?.full_name ?? "Sin nombre"}\nTotal: $${Number(order.total ?? 0).toLocaleString("es-AR")}`);
    }

    const safeCustomer = customer ? {
      fullName: customer.full_name,
      ...(admin ? {
        phone: customer.phone,
        email: customer.email,
        whatsappOptIn: customer.whatsapp_opt_in,
      } : {}),
    } : null;

    return Response.json({
      ok: true,
      order: {
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        total: order.total,
        itemCount: order.item_count,
        customer: safeCustomer,
      },
      message,
      delivery: {
        telegramAdmin: admin ? telegram : { sent: 0, configured: false },
        whatsappCustomer: {
          configured: false,
          eligible: Boolean(customer?.whatsapp_opt_in),
          note: "Pendiente de conectar proveedor/API de WhatsApp.",
        },
      },
    });
  } catch (error) {
    console.error(error);
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return Response.json({ error: "Iniciá sesión para continuar." }, { status: 401 });
    }
    return Response.json({ error: "No se pudo preparar la notificación del pedido." }, { status: 500 });
  }
});