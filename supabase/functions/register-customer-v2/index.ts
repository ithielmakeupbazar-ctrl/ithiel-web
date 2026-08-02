import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { corsHeaders } from "../_shared/cors.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";

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

async function currentUser(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("UNAUTHORIZED");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  return data.user;
}

async function findProfile(userId: string, email: string) {
  const { data: byUser, error: userError } = await db.from("customers").select("*").eq("auth_user_id", userId).maybeSingle();
  if (userError) throw userError;
  if (byUser) return byUser;
  const { data: byEmail, error: emailError } = await db.from("customers").select("*").ilike("email", email).order("created_at").limit(1).maybeSingle();
  if (emailError) throw emailError;
  return byEmail;
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json(request, { error: "Método no permitido." }, 405);

  try {
    const user = await currentUser(request);
    const body = await request.json();
    const email = String(user.email ?? "").trim().toLowerCase();
    const profile = await findProfile(user.id, email);

    if (body.action === "getProfile") return json(request, { data: profile });

    if (body.action === "getOrders") {
      if (!profile?.id) return json(request, { data: [] });
      const { data, error } = await db.from("orders")
        .select("id,order_number,status,purchase_type,fulfillment_type,subtotal,total,item_count,shipping_address,customer_note,created_at,order_items(product_name,variant_name,quantity,unit_price,line_total)")
        .eq("customer_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return json(request, { data: data ?? [] });
    }

    const fullName = String(body.fullName ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
    const phone = String(body.phone ?? "").replace(/\D/g, "");
    const address = String(body.address ?? "").trim().slice(0, 250) || null;
    const whatsappOptIn = body.whatsappOptIn === true;
    if (!fullName) return json(request, { error: "Ingresá nombre y apellido." }, 400);
    if (!/^[0-9]{10,15}$/.test(phone)) return json(request, { error: "Ingresá un WhatsApp válido con código de país." }, 400);

    const values = {
      auth_user_id: user.id,
      email,
      full_name: fullName,
      phone,
      default_address: address,
      whatsapp_opt_in: Boolean(profile?.whatsapp_opt_in) || whatsappOptIn,
      whatsapp_opted_in_at: profile?.whatsapp_opted_in_at ?? (whatsappOptIn ? new Date().toISOString() : null),
      updated_at: new Date().toISOString(),
    };
    const query = profile?.id
      ? db.from("customers").update(values).eq("id", profile.id)
      : db.from("customers").insert(values);
    const { data, error } = await query.select("*").single();
    if (error) throw error;
    await db.auth.admin.updateUserById(user.id, { user_metadata: { ...user.user_metadata, full_name: fullName } });
    return json(request, { ok: true, data, message: profile ? "Perfil actualizado." : "Perfil creado." }, profile ? 200 : 201);
  } catch (error) {
    console.error(error);
    if (error instanceof Error && error.message === "UNAUTHORIZED") return json(request, { error: "Iniciá sesión para continuar." }, 401);
    return json(request, { error: "No pudimos guardar tus datos. Probá nuevamente." }, 500);
  }
});
