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

function normalizeProduct(product: Record<string, any>, detailed = false, productsWithVariants = new Set<string>()) {
  const images = [...(product.product_images ?? [])].sort((a, b) => Number(a.position) - Number(b.position));
  const variants = (product.product_variants ?? []).filter((variant: Record<string, any>) => variant.active).map((variant: Record<string, any>) => ({
    id: variant.id,
    color: variant.color,
    size: variant.size,
    available: Number(variant.stock) > 0,
    ...(detailed ? { imageIndex: images.findIndex((image) => image.image_url === variant.image_url) } : {}),
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
    hasVariants: detailed ? variants.length > 0 : productsWithVariants.has(product.id),
    image: images[0]?.image_url ?? "",
    images: detailed ? images.map((image) => image.image_url) : [],
    category: relationName(product.categories) || "Bazar",
    subcategory: relationName(product.subcategories),
    variants,
    detailsLoaded: detailed,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "GET") return json(request, { error: "Método no permitido." }, 405);

  try {
    const productId = new URL(request.url).searchParams.get("productId")?.trim();
    if (productId) {
      const { data: product, error } = await db.from("products")
        .select("id,sku,name,description,retail_price,wholesale_price,stock,status,categories(name),subcategories(name),product_images(image_url,position),product_variants(id,color,size,stock,active,image_url)")
        .eq("id", productId)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      if (!product) return json(request, { error: "Producto no encontrado." }, 404);
      return json(request, { product: normalizeProduct(product, true) });
    }

    const params = new URL(request.url).searchParams;
    const requestedCategory = params.get("category")?.trim() ?? "";
    const requestedSubcategory = params.get("subcategory")?.trim() ?? "";
    const search = (params.get("search") ?? "").trim().slice(0, 100);
    const requestedLimit = Number(params.get("limit") ?? (params.get("view") === "home" ? 8 : 24));
    const limit = Math.max(1, Math.min(48, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 24));
    const requestedOffset = Number(params.get("offset") ?? 0);
    const offset = Math.max(0, Number.isFinite(requestedOffset) ? Math.floor(requestedOffset) : 0);

    const [{ data: categories, error: categoryError }, { data: subcategories, error: subcategoryError }] = await Promise.all([
      db.from("categories").select("id,name,active").eq("active", true).order("name"),
      db.from("subcategories").select("id,category_id,name,active").eq("active", true).order("name"),
    ]);
    if (categoryError) throw categoryError;
    if (subcategoryError) throw subcategoryError;

    const categoryId = requestedCategory
      ? (categories ?? []).find((category) => category.name.toLocaleLowerCase("es-AR") === requestedCategory.toLocaleLowerCase("es-AR"))?.id
      : "";
    if (requestedCategory && !categoryId) return json(request, { products: [], categories: [], nextOffset: null });
    const subcategoryId = requestedSubcategory
      ? (subcategories ?? []).find((subcategory) => subcategory.category_id === categoryId && subcategory.name.toLocaleLowerCase("es-AR") === requestedSubcategory.toLocaleLowerCase("es-AR"))?.id
      : "";
    if (requestedSubcategory && !subcategoryId) return json(request, { products: [], categories: [], nextOffset: null });

    let productsQuery = db.from("products")
      .select("id,sku,name,description,retail_price,wholesale_price,stock,status,created_at,categories(name),subcategories(name),product_images(image_url,position)")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (categoryId) productsQuery = productsQuery.eq("category_id", categoryId);
    if (subcategoryId) productsQuery = productsQuery.eq("subcategory_id", subcategoryId);
    if (search) {
      const safeSearch = search.replace(/[,%()]/g, " ");
      productsQuery = productsQuery.or(`name.ilike.%${safeSearch}%,sku.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`);
    }
    const { data: products, error: productsError } = await productsQuery;
    if (productsError) throw productsError;

    const productIds = (products ?? []).map((product) => product.id);
    const { data: variantProducts, error: variantsError } = productIds.length
      ? await db.from("product_variants").select("product_id").in("product_id", productIds).eq("active", true)
      : { data: [], error: null };
    if (variantsError) throw variantsError;

    const productsWithVariants = new Set((variantProducts ?? []).map((item) => item.product_id));
    const normalizedProducts = (products ?? []).map((product) => normalizeProduct(product, false, productsWithVariants));
    const normalizedCategories = (categories ?? []).map((category) => ({
      id: category.id,
      name: category.name,
      subcategories: (subcategories ?? []).filter((subcategory) => subcategory.category_id === category.id).map((subcategory) => subcategory.name),
    }));
    return json(request, { products: normalizedProducts, categories: normalizedCategories, nextOffset: normalizedProducts.length === limit ? offset + limit : null });
  } catch (error) {
    console.error(error);
    return json(request, { error: "No se pudo cargar el catálogo." }, 500);
  }
});
