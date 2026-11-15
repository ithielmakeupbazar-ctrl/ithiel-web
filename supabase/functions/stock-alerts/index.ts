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

async function requireAdmin(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("UNAUTHORIZED");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user?.id) throw new Error("UNAUTHORIZED");
  const { data: admin, error: adminError } = await db.from("admin_users").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (adminError) throw adminError;
  if (!admin) throw new Error("FORBIDDEN");
  return data.user;
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
  if (req.method !== "POST") return Response.json({ error: "Método no permitido" }, { status: 405 });

  try {
    await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const notify = body.notify === true;

    const { data, error } = await db
      .from("low_stock_products")
      .select("id,sku,name,stock,status,updated_at")
      .order("stock", { ascending: true });
    if (error) throw error;

    const items = data ?? [];
    let telegram = { sent: 0, configured: Boolean(Deno.env.get("TELEGRAM_BOT_TOKEN")) };
    if (notify && items.length) {
      const lines = items.slice(0, 25).map((item) => `• ${item.name} (${item.sku ?? "sin SKU"}): ${item.stock}`);
      telegram = await sendTelegram(`⚠️ Stock bajo Ithiel\n\n${lines.join("\n")}`);
    }

    return Response.json({ ok: true, threshold: 5, count: items.length, items, telegram });
  } catch (error) {
    console.error(error);
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return Response.json({ error: "Iniciá sesión para continuar." }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return Response.json({ error: "Solo administradores pueden consultar alertas de stock." }, { status: 403 });
    }
    return Response.json({ error: "No se pudo revisar el stock." }, { status: 500 });
  }
});