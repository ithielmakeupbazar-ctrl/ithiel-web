import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

function readServiceKey() {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (typeof keys?.default === "string" && keys.default) return keys.default;
  } catch (_) {
    // El proyecto puede usar la variable clásica en lugar del paquete de secretos.
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

const SERVICE_KEY = readServiceKey();
const adminDb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

class ClientError extends Error {}

function cors(_request: Request) {
  return {
    // La seguridad sigue estando en requireAdmin (token + tabla admin_users).
    // Así funciona desde Cloudflare, Netlify y el futuro dominio propio.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function reply(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors(request) });
}

async function requireAdmin(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("UNAUTHORIZED");

  const { data: auth, error: authError } = await adminDb.auth.getUser(token);
  if (authError || !auth.user?.id) throw new Error("UNAUTHORIZED");

  const { data: admin, error: adminError } = await adminDb
    .from("admin_users")
    .select("user_id,email")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (adminError) throw adminError;
  if (!admin) throw new Error("FORBIDDEN");
  return auth.user;
}

async function dashboard() {
  const [products, lowStock, pendingOrders, processingOrders, coupons] = await Promise.all([
    adminDb.from("products").select("id", { count: "exact", head: true }),
    adminDb.from("low_stock_products").select("id", { count: "exact", head: true }),
    adminDb.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
    adminDb.from("orders").select("id", { count: "exact", head: true }).eq("status", "processing"),
    adminDb.from("coupons").select("id", { count: "exact", head: true }).eq("active", true),
  ]);

  const errors = [products, lowStock, pendingOrders, processingOrders, coupons]
    .map((entry) => entry.error)
    .filter(Boolean);
  if (errors.length) throw errors[0];

  const { data: alerts, error: alertsError } = await adminDb
    .from("low_stock_products")
    .select("id,sku,name,stock,status")
    .order("stock", { ascending: true })
    .limit(10);
  if (alertsError) throw alertsError;

  return {
    totals: {
      products: products.count ?? 0,
      lowStock: lowStock.count ?? 0,
      pendingOrders: pendingOrders.count ?? 0,
      processingOrders: processingOrders.count ?? 0,
      activeCoupons: coupons.count ?? 0,
    },
    alerts: alerts ?? [],
  };
}

async function listProducts() {
  const pageSize = 500;
  const products = [];
  const [{ data: categories, error: categoryError }, { data: subcategories, error: subcategoryError }] = await Promise.all([
    adminDb.from("categories").select("id,name").eq("active", true).order("name"),
    adminDb.from("subcategories").select("id,category_id,name").eq("active", true).order("name"),
  ]);
  if (categoryError) throw categoryError;
  if (subcategoryError) throw subcategoryError;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;

    const { data, error } = await adminDb
      .from("products")
      .select("id,sku,name,description,category_id,subcategory_id,supplier_price,retail_price,wholesale_price,stock,status,created_at,categories(name),subcategories(name),product_images(id,image_url,position),product_variants(id,color,size,sku,stock,retail_price,wholesale_price,active,image_url,created_at)")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const batch = data ?? [];
    products.push(...batch);

    if (batch.length < pageSize) break;
  }

  return { products, categories: categories ?? [], subcategories: subcategories ?? [] };
}

async function catalogOptions() {
  const [{ data: categories, error: categoryError }, { data: subcategories, error: subcategoryError }] = await Promise.all([
    adminDb.from("categories").select("id,name").eq("active", true).order("name"),
    adminDb.from("subcategories").select("id,category_id,name").eq("active", true).order("name"),
  ]);
  if (categoryError) throw categoryError;
  if (subcategoryError) throw subcategoryError;
  return { categories: categories ?? [], subcategories: subcategories ?? [] };
}

async function catalogManagement() {
  const [{ data: categories, error: categoryError }, { data: subcategories, error: subcategoryError }, { data: products, error: productError }] = await Promise.all([
    adminDb.from("categories").select("id,name,active").order("name"),
    adminDb.from("subcategories").select("id,category_id,name,active").order("name"),
    adminDb.from("products").select("id,category_id,subcategory_id"),
  ]);
  if (categoryError) throw categoryError;
  if (subcategoryError) throw subcategoryError;
  if (productError) throw productError;

  const productRows = products ?? [];
  const categoryCounts = new Map<string, number>();
  const subcategoryCounts = new Map<string, number>();
  for (const product of productRows) {
    if (product.category_id) {
      categoryCounts.set(product.category_id, (categoryCounts.get(product.category_id) ?? 0) + 1);
    }
    if (product.subcategory_id) {
      subcategoryCounts.set(product.subcategory_id, (subcategoryCounts.get(product.subcategory_id) ?? 0) + 1);
    }
  }

  return {
    categories: (categories ?? []).map((category) => ({
      ...category,
      product_count: categoryCounts.get(category.id) ?? 0,
    })),
    subcategories: (subcategories ?? []).map((subcategory) => ({
      ...subcategory,
      product_count: subcategoryCounts.get(subcategory.id) ?? 0,
    })),
  };
}

function catalogName(value: unknown, label: string) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
  if (!name) throw new Error(`Ingresá el nombre de la ${label}.`);
  return name;
}

async function saveCategory(body: Record<string, unknown>) {
  const id = String(body.categoryId ?? "");
  const name = catalogName(body.name, "categoría");
  if (id) {
    const { data, error } = await adminDb.from("categories").update({ name, active: body.active !== false }).eq("id", id).select("id,name,active").single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await adminDb.from("categories").insert({ name, active: true }).select("id,name,active").single();
  if (error) throw error;
  return data;
}

async function saveSubcategory(body: Record<string, unknown>) {
  const id = String(body.subcategoryId ?? "");
  const categoryId = String(body.categoryId ?? "");
  const name = catalogName(body.name, "subcategoría");
  if (!categoryId) throw new Error("Elegí la categoría principal.");
  const { data: category, error: categoryError } = await adminDb.from("categories").select("id").eq("id", categoryId).maybeSingle();
  if (categoryError) throw categoryError;
  if (!category) throw new Error("La categoría elegida no existe.");
  if (id) {
    const { data, error } = await adminDb.from("subcategories").update({ category_id: categoryId, name, active: body.active !== false }).eq("id", id).select("id,category_id,name,active").single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await adminDb.from("subcategories").insert({ category_id: categoryId, name, active: true }).select("id,category_id,name,active").single();
  if (error) throw error;
  return data;
}

async function deleteCategory(body: Record<string, unknown>) {
  const categoryId = String(body.categoryId ?? "");
  if (!categoryId) throw new Error("Categoría no válida.");
  const [{ count: productCount, error: productError }, { count: subcategoryCount, error: subcategoryError }] = await Promise.all([
    adminDb.from("products").select("id", { count: "exact", head: true }).eq("category_id", categoryId),
    adminDb.from("subcategories").select("id", { count: "exact", head: true }).eq("category_id", categoryId),
  ]);
  if (productError) throw productError;
  if (subcategoryError) throw subcategoryError;
  if (Number(productCount ?? 0) > 0) throw new Error("No se puede eliminar: esta categoría tiene productos. Archivala o mové los productos primero.");
  if (Number(subcategoryCount ?? 0) > 0) throw new Error("Primero eliminá o mové sus subcategorías.");
  const { error } = await adminDb.from("categories").delete().eq("id", categoryId);
  if (error) throw error;
  return { deleted: true };
}

async function deleteSubcategory(body: Record<string, unknown>) {
  const subcategoryId = String(body.subcategoryId ?? "");
  if (!subcategoryId) throw new Error("Subcategoría no válida.");
  const { count, error: productError } = await adminDb.from("products").select("id", { count: "exact", head: true }).eq("subcategory_id", subcategoryId);
  if (productError) throw productError;
  if (Number(count ?? 0) > 0) throw new Error("No se puede eliminar: esta subcategoría tiene productos. Movelos o dejala inactiva.");
  const { error } = await adminDb.from("subcategories").delete().eq("id", subcategoryId);
  if (error) throw error;
  return { deleted: true };
}

function productValues(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim().slice(0, 180);
  const description = String(body.description ?? "").trim().slice(0, 1500) || null;
  const categoryId = String(body.categoryId ?? "");
  const subcategoryId = String(body.subcategoryId ?? "") || null;

  const supplierRaw = String(body.supplierPrice ?? "").trim();
  const retailRaw = String(body.retailPrice ?? "").trim();
  const wholesaleRaw = String(body.wholesalePrice ?? "").trim();

  // Compatibilidad:
  // - El admin nuevo envía supplierPrice.
  // - El admin anterior no lo enviaba; en ese caso se reconstruye desde retailPrice.
  const supplierPrice = supplierRaw
    ? Number(supplierRaw)
    : retailRaw
      ? Number(retailRaw) / 1.8
      : null;

  // Regla oficial de precios Ithiel:
  // minorista = proveedor + 80%, redondeado hacia arriba al múltiplo de $500.
  // mayorista = minorista - 20%.
  const suggestedRetail = supplierPrice === null ? null : Math.ceil((supplierPrice * 1.8) / 500) * 500;
  const retailPrice = retailRaw ? Number(retailRaw) : suggestedRetail;
  const wholesalePrice = wholesaleRaw
    ? Number(wholesaleRaw)
    : retailPrice === null
      ? null
      : Math.round(retailPrice * 0.8);

  const stock = Number(body.stock);
  const status = body.status === "draft"
    ? "draft"
    : body.status === "archived"
      ? "archived"
      : "published";

  if (!name) throw new Error("Ingresá el nombre del producto.");
  if (!categoryId) throw new Error("Elegí una categoría.");
  if (supplierPrice === null || !Number.isFinite(supplierPrice) || supplierPrice <= 0) {
    throw new Error("El precio proveedor no es válido.");
  }
  if (retailPrice === null || !Number.isFinite(retailPrice) || retailPrice <= 0) {
    throw new Error("El precio minorista no es válido.");
  }
  if (wholesalePrice === null || !Number.isFinite(wholesalePrice) || wholesalePrice <= 0) {
    throw new Error("El precio mayorista no es válido.");
  }
  if (!Number.isInteger(stock) || stock < 0 || stock > 99999) {
    throw new Error("Ingresá un stock válido.");
  }

  return {
    name,
    description,
    category_id: categoryId,
    subcategory_id: subcategoryId,
    supplier_price: Math.round(supplierPrice),
    retail_price: Math.round(retailPrice),
    wholesale_price: Math.round(wholesalePrice),
    stock,
    status,
  };
}

function variantValues(value: unknown, productId: string, index: number, prices: { retail_price: number; wholesale_price: number }) {
  const variant = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawId = String(variant.id ?? "").trim();
  const id = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(rawId) ? rawId : "";
  const color = String(variant.color ?? "").trim().slice(0, 80) || null;
  const size = String(variant.size ?? "").trim().slice(0, 40) || null;
  const stock = Number(variant.stock ?? 0);
  const sku = String(variant.sku ?? "").trim().slice(0, 80) || `ITH-V-${Date.now().toString().slice(-7)}-${index + 1}`;
  if (!color && !size) throw new ClientError("Cada variante debe tener color, talle o ambos.");
  if (!Number.isInteger(stock) || stock < 0 || stock > 99999) throw new ClientError("El stock de una variante no es válido.");
  return {
    id,
    values: {
      product_id: productId,
      color,
      size,
      sku,
      stock,
      retail_price: prices.retail_price,
      wholesale_price: prices.wholesale_price,
      active: variant.active !== false,
    },
  };
}

async function saveProductVariants(productId: string, variants: unknown[], prices: { retail_price: number; wholesale_price: number }) {
  const normalized = variants.map((variant, index) => variantValues(variant, productId, index, prices));
  const keptIds = normalized.map((variant) => variant.id).filter(Boolean);
  let removeQuery = adminDb.from("product_variants").delete().eq("product_id", productId);
  if (keptIds.length) removeQuery = removeQuery.not("id", "in", `(${keptIds.join(",")})`);
  const { error: removeError } = await removeQuery;
  if (removeError) throw removeError;

  for (const variant of normalized) {
    const query = variant.id
      ? adminDb.from("product_variants").update(variant.values).eq("id", variant.id).eq("product_id", productId)
      : adminDb.from("product_variants").insert(variant.values);
    const { error } = await query;
    if (error) throw error;
  }
}

async function saveProduct(body: Record<string, unknown>) {
  const id = String(body.id ?? "");
  const values = productValues(body);
  const variants = Array.isArray(body.variants) ? body.variants : null;
  if (variants?.length) values.stock = variants.reduce((total, variant) => total + Number((variant as Record<string, unknown>)?.stock ?? 0), 0);
  if (id) {
    const { data, error } = await adminDb.from("products").update(values).eq("id", id).select("id").single();
    if (error) throw error;
    if (variants) await saveProductVariants(id, variants, values);
    return { id: data.id, created: false };
  }
  const sku = `ITH-${Date.now().toString().slice(-8)}`;
  const { data, error } = await adminDb.from("products").insert({ ...values, sku }).select("id").single();
  if (error) throw error;
  if (variants) await saveProductVariants(data.id, variants, values);
  return { id: data.id, created: true };
}

async function uploadProductImage(body: Record<string, unknown>) {
  const productId = String(body.productId ?? "");
  const dataUrl = String(body.dataUrl ?? "");
  if (!productId) throw new Error("Primero guardá el producto.");
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Elegí una imagen JPG, PNG o WEBP.");
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  if (bytes.byteLength > 4_000_000) throw new Error("La foto pesa demasiado. Usá una de hasta 4 MB.");
  const extension = match[1] === "image/png" ? "png" : match[1] === "image/webp" ? "webp" : "jpg";
  const path = `admin/${productId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await adminDb.storage.from("product-images").upload(path, bytes, {
    contentType: match[1], upsert: false,
  });
  if (uploadError) throw uploadError;
  const { data: publicUrl } = adminDb.storage.from("product-images").getPublicUrl(path);
  const { data: last, error: lastError } = await adminDb.from("product_images").select("position").eq("product_id", productId).order("position", { ascending: false }).limit(1).maybeSingle();
  if (lastError) throw lastError;
  const { error: imageError } = await adminDb.from("product_images").insert({
    product_id: productId, image_url: publicUrl.publicUrl, position: Number(last?.position ?? 0) + 1,
  });
  if (imageError) throw imageError;
  return { url: publicUrl.publicUrl };
}

async function deleteProductImage(body: Record<string, unknown>) {
  const imageId = String(body.imageId ?? "");
  if (!imageId) throw new Error("Imagen no válida.");
  const { error } = await adminDb.from("product_images").delete().eq("id", imageId);
  if (error) throw error;
  return { deleted: true };
}

async function deleteProduct(body: Record<string, unknown>) {
  const productId = String(body.productId ?? "");
  if (!productId) throw new Error("Producto no válido.");

  const { count: saleCount, error: salesError } = await adminDb
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);
  if (salesError) throw salesError;
  if (Number(saleCount ?? 0) > 0) {
    throw new Error("No se puede eliminar este producto porque ya está relacionado con una venta. Cambiá su estado a Archivado.");
  }

  // Se eliminan primero las relaciones que no deben quedar huérfanas.
  const { data: images, error: imagesError } = await adminDb
    .from("product_images")
    .select("image_url")
    .eq("product_id", productId);
  if (imagesError) throw imagesError;

  const { error: variantsError } = await adminDb.from("product_variants").delete().eq("product_id", productId);
  if (variantsError) throw variantsError;
  const { error: imageRowsError } = await adminDb.from("product_images").delete().eq("product_id", productId);
  if (imageRowsError) throw imageRowsError;

  const { error } = await adminDb.from("products").delete().eq("id", productId);
  if (error) throw error;

  const paths = (images ?? []).map(({ image_url }) => {
    try {
      const marker = "/product-images/";
      const path = new URL(String(image_url)).pathname.split(marker)[1];
      return path ? decodeURIComponent(path) : "";
    } catch (_) { return ""; }
  }).filter(Boolean);
  if (paths.length) await adminDb.storage.from("product-images").remove(paths);
  return { deleted: true };
}

async function listCoupons() {
  const { data, error } = await adminDb
    .from("coupons")
    .select("id,code,discount_percent,starts_at,expires_at,active,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

function couponValues(body: Record<string, unknown>) {
  const code = String(body.code ?? "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 40);
  const discountPercent = Number(body.discountPercent);
  const startsAt = String(body.startsAt ?? "").trim();
  const expiresAt = String(body.expiresAt ?? "").trim();
  const argentinaDate = (value: string, endOfDay = false) => new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}-03:00`
      : value,
  );
  const startsDate = argentinaDate(startsAt);
  const expiresDate = argentinaDate(expiresAt, true);

  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
    throw new ClientError("El código debe tener entre 3 y 40 caracteres: letras, números, guion o guion bajo.");
  }
  if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
    throw new ClientError("Ingresá un porcentaje entre 1 y 100.");
  }
  if (Number.isNaN(startsDate.getTime()) || Number.isNaN(expiresDate.getTime())) {
    throw new ClientError("Completá las fechas de inicio y vencimiento.");
  }
  if (expiresDate <= startsDate) {
    throw new ClientError("El vencimiento debe ser posterior al inicio.");
  }
  return {
    code,
    discount_percent: discountPercent,
    starts_at: startsDate.toISOString(),
    expires_at: expiresDate.toISOString(),
    active: body.active !== false,
  };
}

async function saveCoupon(body: Record<string, unknown>) {
  const couponId = String(body.couponId ?? "");
  const values = couponValues(body);
  const query = couponId
    ? adminDb.from("coupons").update(values).eq("id", couponId)
    : adminDb.from("coupons").insert(values);
  const { data, error } = await query
    .select("id,code,discount_percent,starts_at,expires_at,active,created_at")
    .single();
  if (error?.code === "23505") throw new ClientError("Ya existe un cupón con ese código.");
  if (error) throw error;
  return { ...data, created: !couponId };
}

async function deleteCoupon(body: Record<string, unknown>) {
  const couponId = String(body.couponId ?? "");
  if (!couponId) throw new ClientError("Cupón no válido.");
  const { error } = await adminDb.from("coupons").delete().eq("id", couponId);
  if (error?.code === "23503") {
    throw new ClientError("Este cupón ya fue usado en pedidos. Desactivalo en lugar de eliminarlo.");
  }
  if (error) throw error;
  return { deleted: true };
}

async function updateOrderStatus(body: Record<string, unknown>) {
  const orderId = String(body.orderId ?? "");
  const status = String(body.status ?? "");
  if (!orderId || !["pending", "processing", "completed", "cancelled"].includes(status)) {
    throw new Error("Estado de pedido no válido.");
  }
  const { data, error } = await adminDb.rpc("set_order_status", {
    p_order_id: orderId,
    p_status: status,
  });
  if (error) throw new ClientError(error.message);
  return data;
}

async function listOrders() {
  const { data, error } = await adminDb
    .from("orders")
    .select("id,order_number,status,purchase_type,fulfillment_type,subtotal,discount_amount,total,item_count,coupon_code,shipping_address,customer_note,created_at,customers(full_name,phone,email),order_items(id,product_name,variant_name,quantity,unit_price,line_total)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

async function moveProducts(body: Record<string, unknown>) {
  const productIds = Array.isArray(body.productIds)
    ? [...new Set(body.productIds.map((id) => String(id)).filter(Boolean))]
    : [];
  const categoryId = String(body.categoryId ?? "");
  const subcategoryId = String(body.subcategoryId ?? "") || null;
  if (!productIds.length) throw new ClientError("Seleccioná al menos un producto.");
  if (productIds.length > 500) throw new ClientError("Podés mover hasta 500 productos por vez.");
  if (!categoryId) throw new ClientError("Elegí la categoría de destino.");

  const { data: category, error: categoryError } = await adminDb
    .from("categories").select("id").eq("id", categoryId).eq("active", true).maybeSingle();
  if (categoryError) throw categoryError;
  if (!category) throw new ClientError("La categoría elegida no está disponible.");

  if (subcategoryId) {
    const { data: subcategory, error: subcategoryError } = await adminDb
      .from("subcategories").select("id").eq("id", subcategoryId).eq("category_id", categoryId).eq("active", true).maybeSingle();
    if (subcategoryError) throw subcategoryError;
    if (!subcategory) throw new ClientError("La subcategoría no pertenece a la categoría elegida.");
  }

  const { data, error } = await adminDb
    .from("products")
    .update({ category_id: categoryId, subcategory_id: subcategoryId, updated_at: new Date().toISOString() })
    .in("id", productIds)
    .select("id");
  if (error) throw error;
  return { updated: data?.length ?? 0 };
}

async function listExperiences() {
  const { data, error } = await adminDb
    .from("experiences")
    .select("id,display_name,rating,comment,approved,created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

async function updateExperience(body: Record<string, unknown>) {
  const experienceId = String(body.experienceId ?? "");
  if (!experienceId) throw new ClientError("Experiencia no válida.");
  const { data, error } = await adminDb
    .from("experiences")
    .update({ approved: body.approved === true })
    .eq("id", experienceId)
    .select("id,approved")
    .single();
  if (error) throw error;
  return data;
}

async function deleteExperience(body: Record<string, unknown>) {
  const experienceId = String(body.experienceId ?? "");
  if (!experienceId) throw new ClientError("Experiencia no válida.");
  const { error } = await adminDb.from("experiences").delete().eq("id", experienceId);
  if (error) throw error;
  return { deleted: true };
}

async function listCustomers() {
  const { data: profiles, error } = await adminDb
    .from("customers")
    .select("id,auth_user_id,email,full_name,phone,whatsapp_opt_in,whatsapp_opted_in_at,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;

  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error: usersError } = await adminDb.auth.admin.listUsers({ page, perPage: 1000 });
    if (usersError) throw usersError;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }

  const profileByUser = new Map((profiles ?? []).filter((profile) => profile.auth_user_id).map((profile) => [profile.auth_user_id, profile]));
  const profileByEmail = new Map((profiles ?? []).filter((profile) => profile.email).map((profile) => [String(profile.email).toLowerCase(), profile]));
  const linkedProfileIds = new Set<string>();
  const registered = users.map((user) => {
    const profile = profileByUser.get(user.id) ?? profileByEmail.get(String(user.email ?? "").toLowerCase());
    if (profile?.id) linkedProfileIds.add(profile.id);
    return {
      id: profile?.id ?? null,
      auth_user_id: user.id,
      email: user.email ?? profile?.email ?? "",
      full_name: profile?.full_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? "Cuenta registrada",
      phone: profile?.phone ?? "",
      whatsapp_opt_in: Boolean(profile?.whatsapp_opt_in),
      created_at: profile?.created_at ?? user.created_at,
      profile_complete: Boolean(profile?.full_name && profile?.phone),
    };
  });
  const guests = (profiles ?? []).filter((profile) => !linkedProfileIds.has(profile.id)).map((profile) => ({ ...profile, profile_complete: Boolean(profile.full_name && profile.phone) }));
  return [...registered, ...guests].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
}

async function createCustomer(body: Record<string, unknown>) {
  const fullName = String(body.fullName ?? "").trim().slice(0, 100);
  const phone = String(body.phone ?? "").replace(/\D/g, "");
  const whatsappOptIn = body.whatsappOptIn === true;
  if (!fullName) throw new Error("Ingresá el nombre de la clienta.");
  if (!/^[0-9]{10,15}$/.test(phone)) {
    throw new Error("Ingresá un WhatsApp válido con código de país.");
  }

  const { data: existing, error: searchError } = await adminDb
    .from("customers")
    .select("id,whatsapp_opt_in,whatsapp_opted_in_at")
    .eq("phone", phone)
    .maybeSingle();
  if (searchError) throw searchError;

  if (existing) {
    const { error } = await adminDb.from("customers").update({
      full_name: fullName,
      whatsapp_opt_in: Boolean(existing.whatsapp_opt_in) || whatsappOptIn,
      whatsapp_opted_in_at: existing.whatsapp_opted_in_at ?? (whatsappOptIn ? new Date().toISOString() : null),
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
    if (error) throw error;
    return { created: false, id: existing.id };
  }

  const { data, error } = await adminDb.from("customers").insert({
    full_name: fullName,
    phone,
    whatsapp_opt_in: whatsappOptIn,
    whatsapp_opted_in_at: whatsappOptIn ? new Date().toISOString() : null,
  }).select("id").single();
  if (error) throw error;
  return { created: true, id: data.id };
}

async function deleteCustomer(body: Record<string, unknown>) {
  const customerId = String(body.customerId ?? "");
  if (!customerId) throw new Error("Cliente no válido.");
  const { count, error: ordersError } = await adminDb
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId);
  if (ordersError) throw ordersError;
  if (Number(count ?? 0) > 0) {
    throw new Error("No se puede eliminar esta clienta porque tiene pedidos registrados.");
  }
  const { error } = await adminDb.from("customers").delete().eq("id", customerId);
  if (error) throw error;
  return { deleted: true };
}

function adminEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new ClientError("Ingresá un email válido.");
  }
  return email;
}

async function listAdmins() {
  const { data, error } = await adminDb.from("admin_users").select("user_id,email").order("email");
  if (error) throw error;
  return data ?? [];
}

async function grantAdmin(body: Record<string, unknown>) {
  const email = adminEmail(body.email);
  const { data: users, error: usersError } = await adminDb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw usersError;
  const user = users.users.find((item) => item.email?.toLowerCase() === email);
  if (!user) throw new ClientError("Esta cuenta todavía no inició sesión. Pedile que entre al panel una vez y probá de nuevo.");
  const { data: existing, error: existingError } = await adminDb.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { created: false, user_id: user.id, email };
  const { error } = await adminDb.from("admin_users").insert({ user_id: user.id, email });
  if (error) throw error;
  return { created: true, user_id: user.id, email };
}

async function revokeAdmin(body: Record<string, unknown>, callerId: string) {
  const userId = String(body.userId ?? "");
  if (!userId) throw new ClientError("Administrador no válido.");
  if (userId === callerId) throw new ClientError("No podés quitar tu propio acceso desde el panel.");
  const { count, error: countError } = await adminDb.from("admin_users").select("user_id", { count: "exact", head: true });
  if (countError) throw countError;
  if (Number(count ?? 0) <= 1) throw new ClientError("Debe quedar al menos un administrador.");
  const { error } = await adminDb.from("admin_users").delete().eq("user_id", userId);
  if (error) throw error;
  return { deleted: true };
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(request) });
  if (request.method !== "POST") return reply(request, { error: "Método no permitido." }, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Falta la configuración privada de Supabase.");
    const caller = await requireAdmin(request);
    const body = await request.json();
    const action = String(body?.action ?? "dashboard");

    if (action === "dashboard") return reply(request, { ok: true, data: await dashboard() });
    if (action === "products") return reply(request, { ok: true, data: await listProducts() });
    if (action === "catalogOptions") return reply(request, { ok: true, data: await catalogOptions() });
    if (action === "catalogManagement") return reply(request, { ok: true, data: await catalogManagement() });
    if (action === "saveCategory") return reply(request, { ok: true, data: await saveCategory(body) });
    if (action === "saveSubcategory") return reply(request, { ok: true, data: await saveSubcategory(body) });
    if (action === "deleteCategory") return reply(request, { ok: true, data: await deleteCategory(body) });
    if (action === "deleteSubcategory") return reply(request, { ok: true, data: await deleteSubcategory(body) });
    if (action === "saveProduct") return reply(request, { ok: true, data: await saveProduct(body) });
    if (action === "moveProducts") return reply(request, { ok: true, data: await moveProducts(body) });
    if (action === "uploadProductImage") return reply(request, { ok: true, data: await uploadProductImage(body) }, 201);
    if (action === "deleteProductImage") return reply(request, { ok: true, data: await deleteProductImage(body) });
    if (action === "deleteProduct") return reply(request, { ok: true, data: await deleteProduct(body) });
    if (action === "coupons") return reply(request, { ok: true, data: await listCoupons() });
    if (action === "saveCoupon") return reply(request, { ok: true, data: await saveCoupon(body) });
    if (action === "deleteCoupon") return reply(request, { ok: true, data: await deleteCoupon(body) });
    if (action === "orders") return reply(request, { ok: true, data: await listOrders() });
    if (action === "updateOrderStatus") return reply(request, { ok: true, data: await updateOrderStatus(body) });
    if (action === "experiences") return reply(request, { ok: true, data: await listExperiences() });
    if (action === "updateExperience") return reply(request, { ok: true, data: await updateExperience(body) });
    if (action === "deleteExperience") return reply(request, { ok: true, data: await deleteExperience(body) });
    if (action === "customers") return reply(request, { ok: true, data: await listCustomers() });
    if (action === "createCustomer") return reply(request, { ok: true, data: await createCustomer(body) }, 201);
    if (action === "deleteCustomer") return reply(request, { ok: true, data: await deleteCustomer(body) });
    if (action === "admins") return reply(request, { ok: true, data: await listAdmins() });
    if (action === "grantAdmin") return reply(request, { ok: true, data: await grantAdmin(body) });
    if (action === "revokeAdmin") return reply(request, { ok: true, data: await revokeAdmin(body, caller.id) });

    return reply(request, { error: "Acción no válida." }, 400);
  } catch (error) {
    console.error(error);
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return reply(request, { error: "Iniciá sesión para continuar." }, 401);
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return reply(request, { error: "Tu cuenta no está autorizada para este panel." }, 403);
    }
    if (error instanceof ClientError) {
      return reply(request, { error: error.message }, 400);
    }
    return reply(request, { error: "No se pudo cargar el panel." }, 500);
  }
});
