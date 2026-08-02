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

function relationName(value: unknown) {
  const relation = Array.isArray(value) ? value[0] : value;
  if (!relation || typeof relation !== "object" || !("name" in relation)) return "";
  return String((relation as { name?: unknown }).name ?? "");
}

function json(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: { ...corsHeaders(request), "Cache-Control": "public, max-age=60, s-maxage=120" } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "GET") return json(request, { error: "Método no permitido." }, 405);

  try {
    const products = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await db.from("products")
        .select("id,sku,name,description,retail_price,wholesale_price,stock,status,created_at,categories(name),subcategories(name),product_images(image_url,position),product_variants(id,color,size,sku,stock,retail_price,wholesale_price,active,image_url,created_at)")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .range(from, from + 499);
      if (error) throw error;
      products.push(...(data ?? []));
      if ((data ?? []).length < 500) break;
    }

    const [{ data: categories, error: categoryError }, { data: subcategories, error: subcategoryError }] = await Promise.all([
      db.from("categories").select("id,name,active").eq("active", true).order("name"),
      db.from("subcategories").select("id,category_id,name,active").eq("active", true).order("name"),
    ]);
    if (categoryError) throw categoryError;
    if (subcategoryError) throw subcategoryError;

    const normalizedProducts = products.map((product) => {
      const images = [...(product.product_images ?? [])].sort((a, b) => Number(a.position) - Number(b.position));
      const variants = (product.product_variants ?? []).filter((variant) => variant.active).map((variant) => ({
        id: variant.id,
        color: variant.color,
        size: variant.size,
        sku: variant.sku,
        stock: variant.stock,
        available: Number(variant.stock) > 0,
        retailPrice: variant.retail_price,
        wholesalePrice: variant.wholesale_price,
        image: variant.image_url,
      }));
      return {
        id: product.id,
        sku: product.sku,
        title: product.name,
        description: product.description,
        price: product.retail_price,
        wholesalePrice: product.wholesale_price,
        stock: product.stock,
        available: Number(product.stock) > 0,
        hasVariants: variants.length > 0,
        image: images[0]?.image_url ?? variants.find((variant) => variant.image)?.image ?? "",
        images: images.map((image) => image.image_url),
        category: relationName(product.categories) || "Bazar",
        subcategory: relationName(product.subcategories),
        variants,
      };
    });
    const normalizedCategories = (categories ?? []).map((category) => ({
      id: category.id,
      name: category.name,
      subcategories: (subcategories ?? []).filter((subcategory) => subcategory.category_id === category.id).map((subcategory) => subcategory.name),
    }));
    return json(request, { products: normalizedProducts, categories: normalizedCategories });
  } catch (error) {
    console.error(error);
    return json(request, { error: "No se pudo cargar el catálogo." }, 500);
  }
});
