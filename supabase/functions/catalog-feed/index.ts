import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const secretKey = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function csv(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response("Método no permitido", { status: 405, headers: corsHeaders });
  }

  const { data: products, error } = await supabase
    .from("products")
    .select("id,sku,name,description,retail_price,stock,product_images(image_url,position)")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return new Response("Error al generar el catálogo", { status: 500, headers: corsHeaders });
  }

  const rows = [[
    "id",
    "title",
    "description",
    "availability",
    "condition",
    "price",
    "link",
    "image_link",
    "brand",
  ].join(",")];

  for (const product of products ?? []) {
    const images = Array.isArray(product.product_images)
      ? [...product.product_images].sort((a, b) => Number(a.position ?? 9999) - Number(b.position ?? 9999))
      : [];

    const imageUrl = images[0]?.image_url ?? "";
    const availability = Number(product.stock ?? 0) > 0 ? "in stock" : "out of stock";
    const productLink = `https://ithielbazarymakeup.site/`;

    rows.push([
      csv(product.sku ?? product.id),
      csv(product.name),
      csv(product.description || product.name),
      csv(availability),
      csv("new"),
      csv(`${Number(product.retail_price)} ARS`),
      csv(productLink),
      csv(imageUrl),
      csv("Ithiel"),
    ].join(","));
  }

  return new Response(rows.join("\n"), {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
});