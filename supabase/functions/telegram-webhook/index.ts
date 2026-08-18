// VERSION: category-manager-2026-07-19
// Ithiel Telegram: catálogo por categorías, stock ascendente y campos opcionales.
import { createClient } from "jsr:@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const SERVICE_KEY = keys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const allowedUsers = (Deno.env.get("TELEGRAM_ALLOWED_USER_IDS") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const menuKeyboard = {
  keyboard: [["➕ Cargar producto", "📋 Borradores"], ["🛍️ Catálogo", "📦 Stock"], ["📦 Pedidos", "❓ Ayuda"]],
  resize_keyboard: true,
};
const cancelKeyboard = { keyboard: [["⬅️ Atrás", "❌ Cancelar"]], resize_keyboard: true };
const omitKeyboard = { keyboard: [["⏭️ Omitir"], ["⬅️ Atrás", "❌ Cancelar"]], resize_keyboard: true };
const photoKeyboard = { keyboard: [["✅ Terminé las fotos"], ["⬅️ Atrás", "❌ Cancelar"]], resize_keyboard: true };
const colorKeyboard = { keyboard: [["➡️ Siguiente color"], ["⬅️ Atrás", "❌ Cancelar"]], resize_keyboard: true };
const confirmKeyboard = { keyboard: [["📝 Guardar borrador", "🚀 Publicar ahora"], ["⬅️ Atrás", "❌ Cancelar"]], resize_keyboard: true };
const html = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const money = (value: number | null | undefined) => `$${Number(value ?? 0).toLocaleString("es-AR")}`;
const isOmit = (text: string) => text === "⏭️ Omitir" || /^omitir$/i.test(text);

async function telegram(method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!result.ok) throw new Error(result.description ?? "Error de Telegram");
  return result.result;
}
async function send(chatId: string | number, text: string, extra: Record<string, unknown> = {}) {
  return telegram("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });
}
async function answerCallback(id: string) { await telegram("answerCallbackQuery", { callback_query_id: id }).catch(() => null); }
async function ensureUser(userId: string) {
  if (!allowedUsers.includes(userId)) return false;
  const { error } = await supabase.from("authorized_users").upsert({ telegram_user_id: userId }, { onConflict: "telegram_user_id" });
  if (error) throw error;
  return true;
}
async function session(userId: string) {
  const { data } = await supabase.from("bot_sessions").select("state,draft").eq("telegram_user_id", userId).maybeSingle();
  return data ?? { state: "idle", draft: {} };
}
async function saveSession(userId: string, state: string, draft: Record<string, unknown> = {}) {
  const { error } = await supabase.from("bot_sessions").upsert({ telegram_user_id: userId, state, draft, updated_at: new Date().toISOString() }, { onConflict: "telegram_user_id" });
  if (error) throw error;
}
async function reset(userId: string) { await saveSession(userId, "idle", {}); }
async function sendMenu(chatId: string | number, text = "¿Qué querés hacer?") { await send(chatId, text, { reply_markup: menuKeyboard }); }

function parseMoney(value: string) { return Number(value.replace(/[^0-9]/g, "")); }
function parseQuick(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const minorLine = lines.find((line) => /\b(menor|minorista)\b/i.test(line));
  const majorLine = lines.find((line) => /\b(mayor|mayorista)\b/i.test(line));
  const title = lines.find((line) => !/\b(menor|minorista|mayor|mayorista|desc(ripci[oó]n)?|descripci[oó]n)\b/i.test(line));
  const description = lines.find((line) => /^(desc(ripci[oó]n)?|descripci[oó]n)\s*:/i.test(line))?.replace(/^(desc(ripci[oó]n)?|descripci[oó]n)\s*:\s*/i, "") ?? "";
  const retail = minorLine ? parseMoney(minorLine) : 0;
  const wholesale = majorLine ? parseMoney(majorLine) : null;
  return { title, description, retail, wholesale };
}
function typeFor(category: string) { return category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }

async function categories(chatId: string | number, userId: string) {
  const { data, error } = await supabase.from("categories").select("id,name").eq("active", true).order("name");
  if (error) throw error;
  const current = await session(userId);
  const rows = (data ?? []).map((item) => [item.name]);
  rows.push(["➕ Otra categoría"], ["❌ Cancelar"]);
  await saveSession(userId, "category", current.draft ?? {});
  await send(chatId, "Elegí la categoría principal:", { reply_markup: { keyboard: rows, resize_keyboard: true } });
}
async function subcategories(chatId: string | number, userId: string, draft: any) {
  const { data, error } = await supabase.from("subcategories").select("id,name").eq("category_id", draft.categoryId).eq("active", true).order("name");
  if (error) throw error;
  const rows = (data ?? []).map((item) => [item.name]);
  rows.push(["Sin subcategoría", "➕ Otra"], ["❌ Cancelar"]);
  await saveSession(userId, "subcategory", draft);
  await send(chatId, "Elegí una subcategoría:", { reply_markup: { keyboard: rows, resize_keyboard: true } });
}
async function chooseInputMethod(chatId: string | number, userId: string, draft: any) {
  await saveSession(userId, "input_method", draft);
  await send(chatId, "¿Cómo querés cargar el producto?", { reply_markup: { keyboard: [["⚡ Pegar título y precios"], ["✍️ Cargar paso a paso"], ["⬅️ Atrás", "❌ Cancelar"]], resize_keyboard: true } });
}
async function uploadPhoto(userId: string, photo: any) {
  const file = await telegram("getFile", { file_id: photo.file_id });
  const response = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`);
  if (!response.ok) throw new Error("No se pudo descargar la foto");
  const bytes = await response.arrayBuffer();
  const path = `pending/${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("product-images").upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}
async function summary(chatId: string | number, userId: string, draft: any) {
  const colors = (draft.colors ?? []).join(", ") || "No aplica";
  const sizes = (draft.sizes ?? []).join(", ") || "No aplica";
  await saveSession(userId, "confirm", draft);
  await send(chatId, `<b>Revisá el producto</b>\n\n<b>${html(draft.title)}</b>\n${html(draft.description || "Sin descripción")}\nCategoría: ${html(draft.categoryName)}${draft.subcategoryName ? ` · ${html(draft.subcategoryName)}` : ""}\nColores: ${html(colors)}\nTalles: ${html(sizes)}\nStock inicial: 30\nMinorista: <b>${draft.retail ? money(draft.retail) : "No informado"}</b>\nMayorista: <b>${draft.wholesale ? money(draft.wholesale) : "No informado"}</b>\nFotos: ${draft.images?.length ?? 0}`, {
    reply_markup: confirmKeyboard,
  });
}
async function createProduct(chatId: string | number, userId: string, draft: any, status: "draft" | "published") {
  const sku = `ITH-${Date.now().toString().slice(-8)}`;
  const { data: product, error } = await supabase.from("products").insert({ sku, name: draft.title, description: draft.description || null, category_id: draft.categoryId, subcategory_id: draft.subcategoryId || null, retail_price: draft.retail || null, wholesale_price: draft.wholesale || null, stock: 30, status }).select("id").single();
  if (error) throw error;
  const images = (draft.images ?? []).map((url: string, index: number) => ({ product_id: product.id, image_url: url, position: index + 1 }));
  if (images.length) { const { error: imageError } = await supabase.from("product_images").insert(images); if (imageError) throw imageError; }
  const colors = draft.colors?.length ? draft.colors : [null];
  const sizes = draft.sizes?.length ? draft.sizes : [null];
  const variants = colors.flatMap((color: string | null) => sizes.map((size: string | null, index: number) => ({ product_id: product.id, color, size, sku: `${sku}-${(color || "u").slice(0, 4)}-${(size || index + 1)}`, stock: 30, retail_price: draft.retail || null, wholesale_price: draft.wholesale || null, image_url: color ? draft.colorImages?.[color]?.[0] ?? null : null, active: true })));
  if (draft.colors?.length || draft.sizes?.length) { const { error: variantError } = await supabase.from("product_variants").insert(variants); if (variantError) throw variantError; }
  await reset(userId);
  await sendMenu(chatId, `${status === "published" ? "✅ Publicado" : "📝 Borrador creado"}\n\n<b>${html(draft.title)}</b>\nCódigo: <code>${sku}</code>\nMinorista: ${draft.retail ? money(draft.retail) : "No informado"}\nMayorista: ${draft.wholesale ? money(draft.wholesale) : "No informado"}`);
}

async function productList(chatId: string | number, userId: string, status?: string) {
  let query = supabase.from("products").select("id,name,sku,status,retail_price").order("created_at", { ascending: false }).limit(12);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length) { await sendMenu(chatId, "No hay productos en esta lista."); return; }
  const productOptions: Record<string, string> = {};
  const rows = data.map((item) => {
    const label = `${item.name} · ${money(item.retail_price)} · ${item.sku}`.slice(0, 60);
    productOptions[label] = item.id;
    return [label];
  });
  rows.push(["⬅️ Volver al menú"]);
  await saveSession(userId, "product_select", { productOptions, listStatus: status ?? null });
  await send(chatId, "Elegí un producto:", { reply_markup: { keyboard: rows, resize_keyboard: true } });
}
async function stockList(chatId: string | number, userId: string) {
  const { data, error } = await supabase.from("products").select("id,name,sku,stock,status").eq("status", "published").order("stock", { ascending: true }).order("name", { ascending: true }).limit(80);
  if (error) throw error;
  if (!data?.length) return sendMenu(chatId, "No hay productos publicados con stock.");
  const productOptions: Record<string, string> = {};
  const rows = data.map((item) => {
    const label = `${Number(item.stock ?? 0) <= 5 ? "⚠️" : "📦"} ${item.stock} u. · ${item.name} · ${item.sku}`.slice(0, 60);
    productOptions[label] = item.id;
    return [label];
  });
  rows.push(["⬅️ Volver al menú"]);
  await saveSession(userId, "stock_select", { productOptions });
  await send(chatId, "<b>Stock</b> — de menor a mayor. Elegí un producto:", { reply_markup: { keyboard: rows, resize_keyboard: true } });
}
async function catalogCategories(chatId: string | number, userId: string) {
  const { data, error } = await supabase.from("categories").select("id,name").eq("active", true).order("name");
  if (error) throw error;
  const options: Record<string, string> = {};
  const rows = (data ?? []).map((category) => {
    options[category.name] = category.id;
    return [category.name];
  });
  rows.push(["⬅️ Volver al menú"]);
  await saveSession(userId, "catalog_category", { catalogCategoryOptions: options });
  await send(chatId, "<b>Catálogo interno</b>\nElegí una categoría:", { reply_markup: { keyboard: rows, resize_keyboard: true } });
}

async function productPanel(chatId: string | number, userId: string, productId: string) {
  const { data: product, error } = await supabase.from("products").select("id,name,sku,status,stock,retail_price,wholesale_price").eq("id", productId).single();
  if (error) throw error;
  const toggle = product.status === "archived" ? "✅ Habilitar producto" : "⏸️ Deshabilitar producto";
  await saveSession(userId, "product_panel", { productId });
  await send(chatId, `<b>${html(product.name)}</b>\nCódigo: <code>${product.sku}</code>\nEstado: ${product.status}\nStock: <b>${product.stock}</b>\nMinorista: ${money(product.retail_price)}\nMayorista: ${product.wholesale_price ? money(product.wholesale_price) : "No informado"}`, { reply_markup: { keyboard: [["✏️ Editar precios", toggle], ["📉 Registrar venta", "🗑️ Eliminar producto"], ["⬅️ Volver al catálogo"]], resize_keyboard: true } });
}

async function orderList(chatId: string | number, userId: string) {
  const { data, error } = await supabase.from("orders").select("id,order_number,status,total,customers(full_name)").in("status", ["pending", "processing"]).order("created_at", { ascending: false }).limit(15);
  if (error) throw error;
  if (!data?.length) return sendMenu(chatId, "No hay pedidos pendientes.");
  const orderOptions: Record<string, string> = {};
  const rows = data.map((order: any) => {
    const name = order.customers?.full_name || "Cliente";
    const label = `#${order.order_number} · ${name} · ${order.status === "pending" ? "Pendiente" : "En proceso"}`.slice(0, 60);
    orderOptions[label] = order.id;
    return [label];
  });
  rows.push(["⬅️ Volver al menú"]);
  await saveSession(userId, "order_select", { orderOptions });
  await send(chatId, "Elegí un pedido:", { reply_markup: { keyboard: rows, resize_keyboard: true } });
}

async function handleText(message: any) {
  const chatId = message.chat.id; const userId = String(message.from.id); const text = (message.text ?? "").trim();
  if (text === "/id") return send(chatId, `Tu ID es: <code>${userId}</code>`);
  if (!(await ensureUser(userId))) return send(chatId, `⛔ Sin acceso. Tu ID es: <code>${userId}</code>`);
  if (["/start", "/ayuda", "❓ Ayuda"].includes(text)) return sendMenu(chatId);
  if (["/cancel", "/cancelar", "❌ Cancelar"].includes(text)) { await reset(userId); return sendMenu(chatId, "Carga cancelada."); }
  if (["/nuevo", "➕ Cargar producto"].includes(text)) { await saveSession(userId, "photos", { images: [], colorImages: {} }); return send(chatId, "Mandame una o varias fotos del producto. Cuando termines, tocá “✅ Terminé las fotos”.", { reply_markup: photoKeyboard }); }
  if (["/borradores", "📋 Borradores"].includes(text)) return productList(chatId, userId, "draft");
  if (["/catalogo", "🛍️ Catálogo"].includes(text)) return catalogCategories(chatId, userId);
  if (text === "📦 Stock") return stockList(chatId, userId);
  if (text === "📦 Pedidos") return orderList(chatId, userId);

  const current = await session(userId); const draft: any = current.draft ?? {};

  if (current.state === "photos" && text === "✅ Terminé las fotos") return categories(chatId, userId);

  if (current.state === "category") {
    if (text === "➕ Otra categoría") {
      await saveSession(userId, "custom_category", draft);
      return send(chatId, "Escribí el nombre de la nueva categoría:", { reply_markup: cancelKeyboard });
    }
    const { data: category } = await supabase.from("categories").select("id,name").eq("name", text).eq("active", true).maybeSingle();
    if (!category) return send(chatId, "Elegí una categoría usando los botones.");
    return subcategories(chatId, userId, { ...draft, categoryId: category.id, categoryName: category.name });
  }

  if (current.state === "subcategory") {
    if (text === "➕ Otra") {
      await saveSession(userId, "custom_subcategory", draft);
      return send(chatId, "Escribí el nombre de la subcategoría:", { reply_markup: cancelKeyboard });
    }
    if (text === "Sin subcategoría") return chooseInputMethod(chatId, userId, draft);
    const { data: sub } = await supabase.from("subcategories").select("id,name").eq("category_id", draft.categoryId).eq("name", text).eq("active", true).maybeSingle();
    if (!sub) return send(chatId, "Elegí una subcategoría usando los botones.");
    return chooseInputMethod(chatId, userId, { ...draft, subcategoryId: sub.id, subcategoryName: sub.name });
  }

  if (current.state === "input_method") {
    if (text === "⚡ Pegar título y precios") {
      await saveSession(userId, "quick", { ...draft, entryMode: "quick" });
      return send(chatId, "Pegá la información así:\n\n<b>AZUCARERA DOSIFICADOR</b>\nMENOR $4.500\nMAYOR $3.600\n\nPodés agregar <code>DESCRIPCIÓN: ...</code>.", { reply_markup: cancelKeyboard });
    }
    if (text === "✍️ Cargar paso a paso") {
      await saveSession(userId, "manual_title", { ...draft, entryMode: "manual" });
      return send(chatId, "Escribí el título del producto:", { reply_markup: cancelKeyboard });
    }
  }

  if (current.state === "manual_title") {
    if (!text) return send(chatId, "Escribí un título válido.");
    await saveSession(userId, "manual_retail", { ...draft, title: text });
    return send(chatId, "Escribí el precio MINORISTA o tocá Omitir.", { reply_markup: omitKeyboard });
  }
  if (current.state === "manual_retail") {
    const retail = isOmit(text) ? null : parseMoney(text);
    await saveSession(userId, "manual_wholesale", { ...draft, retail });
    return send(chatId, "Escribí el precio MAYORISTA o tocá Omitir.", { reply_markup: omitKeyboard });
  }
  if (current.state === "manual_wholesale") {
    const wholesale = isOmit(text) ? null : parseMoney(text);
    await saveSession(userId, "description", { ...draft, wholesale });
    return send(chatId, "Escribí una descripción breve o tocá Omitir.", { reply_markup: omitKeyboard });
  }
  if (current.state === "quick") {
    const info = parseQuick(text);
    if (!info.title || (!info.retail && !info.wholesale)) return send(chatId, "No pude detectar título y precio.");
    await saveSession(userId, "description", { ...draft, title: info.title, description: info.description, retail: info.retail || null, wholesale: info.wholesale });
    return send(chatId, "Escribí una descripción breve o tocá Omitir.", { reply_markup: omitKeyboard });
  }
  if (current.state === "description") return summary(chatId, userId, { ...draft, description: isOmit(text) ? "" : text });

  if (current.state === "custom_category") {
    const { data, error } = await supabase.from("categories").upsert({ name: text, active: true }, { onConflict: "name" }).select("id,name").single();
    if (error) throw error;
    return subcategories(chatId, userId, { ...draft, categoryId: data.id, categoryName: data.name });
  }
  if (current.state === "custom_subcategory") {
    const { data, error } = await supabase.from("subcategories").upsert({ category_id: draft.categoryId, name: text, active: true }, { onConflict: "category_id,name" }).select("id,name").single();
    if (error) throw error;
    return chooseInputMethod(chatId, userId, { ...draft, subcategoryId: data.id, subcategoryName: data.name });
  }

  if (current.state === "confirm") {
    if (text === "📝 Guardar borrador") return createProduct(chatId, userId, draft, "draft");
    if (text === "🚀 Publicar ahora") return createProduct(chatId, userId, draft, "published");
  }

  return sendMenu(chatId);
}

async function handlePhoto(message: any) {
  const chatId = message.chat.id; const userId = String(message.from.id);
  if (!(await ensureUser(userId))) return;
  const current = await session(userId); const draft: any = current.draft ?? {};
  if (current.state !== "photos") return send(chatId, "Primero tocá “➕ Cargar producto”.", { reply_markup: menuKeyboard });
  const url = await uploadPhoto(userId, message.photo[message.photo.length - 1]);
  const images = [...(draft.images ?? []), url];
  await saveSession(userId, "photos", { ...draft, images });
  return send(chatId, `✅ Foto ${images.length} guardada. Mandá otra o tocá “✅ Terminé las fotos”.`, { reply_markup: photoKeyboard });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ ok: true, service: "Ithiel Telegram Bot", version: "category-manager-2026-07-19" });
  try {
    const update = await request.json();
    if (update.message?.photo) await handlePhoto(update.message);
    else if (update.message?.text) await handleText(update.message);
    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false }, { status: 200 });
  }
});
