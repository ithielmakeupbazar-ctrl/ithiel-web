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
  const { data: admin, error: adminError } = await db
    .from("admin_users")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (adminError) throw adminError;
  if (!admin) throw new Error("FORBIDDEN");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Método no permitido" }, { status: 405 });

  try {
    await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit ?? 10), 1), 50);
    const now = new Date().toISOString();

    const { data: jobs, error } = await db
      .from("publication_jobs")
      .select("id,product_id,channel,status,scheduled_at,external_id,error_message,products(id,sku,name,status)")
      .in("status", ["pending", "scheduled"])
      .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;

    const processed: Record<string, unknown>[] = [];

    for (const job of jobs ?? []) {
      const product = Array.isArray(job.products) ? job.products[0] : job.products;
      if (!product || product.status !== "published") {
        const { error: failedError } = await db
          .from("publication_jobs")
          .update({
            status: "error",
            error_message: "El producto no está publicado o ya no existe.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .in("status", ["pending", "scheduled"]);
        if (failedError) throw failedError;
        processed.push({ id: job.id, channel: job.channel, status: "error" });
        continue;
      }

      if (job.channel === "website") {
        const { error: updateError } = await db
          .from("publication_jobs")
          .update({
            status: "published",
            external_id: `website:${job.product_id}`,
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .in("status", ["pending", "scheduled"]);
        if (updateError) throw updateError;
        processed.push({ id: job.id, channel: job.channel, status: "published" });
        continue;
      }

      processed.push({
        id: job.id,
        channel: job.channel,
        status: job.status,
        note: "Canal pendiente de conectar a su proveedor externo.",
      });
    }

    return Response.json({
      ok: true,
      processed,
      pendingExternalChannels: processed.filter((item) => item.status === "pending" || item.status === "scheduled").length,
    });
  } catch (error) {
    console.error(error);
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return Response.json({ error: "Iniciá sesión para continuar." }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return Response.json({ error: "Solo administradores pueden ejecutar el worker de publicación." }, { status: 403 });
    }
    return Response.json({ error: "No se pudo procesar la cola de publicación." }, { status: 500 });
  }
});