const dialogSelectors = [
  ".whatsapp-modal",
  ".social-modal",
  ".auth-modal",
  ".product-detail-modal",
  ".cart-modal",
  ".image-zoom-modal",
];

let opener = null;

document.querySelector("main")?.setAttribute("id", "contenido");
const toast = document.querySelector("#cart-toast");
toast?.setAttribute("role", "status");
toast?.setAttribute("aria-live", "polite");

const fieldLabels = [
  ["#register-modal input[type='text']", "Nombre y apellido", "register-name"],
  ["#register-modal input[type='email']", "Email", "register-email"],
  ["#register-password", "Contraseña", "register-password"],
  ["#register-confirm", "Confirmar contraseña", "register-confirm"],
  ["#account-modal input[type='email']", "Email", "account-email"],
  ["#account-password", "Contraseña", "account-password"],
];
fieldLabels.forEach(([selector, label, name]) => {
  const input = document.querySelector(selector);
  input?.setAttribute("aria-label", label);
  input?.setAttribute("name", name);
});
document.querySelectorAll(".auth-close").forEach((button) => {
  button.setAttribute("aria-label", "Cerrar");
});

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("button, a");
  if (trigger) opener = trigger;
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const modal = dialogSelectors
    .map((selector) => document.querySelector(`${selector}.open`))
    .find(Boolean);
  if (!modal) return;
  modal.querySelector("[data-close-whatsapp], [data-close-social], [data-close-auth], [data-close-product-detail], [data-close-cart], [data-close-image-zoom]")?.click();
  opener?.focus();
});

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    const modal = mutation.target;
    if (!modal.classList.contains("open")) continue;
    modal.querySelector("button, a, input, textarea, select")?.focus();
  }
});

dialogSelectors.forEach((selector) => {
  document.querySelectorAll(selector).forEach((modal) => {
    observer.observe(modal, { attributes: true, attributeFilter: ["class"] });
  });
});


/* Ithiel cart consistency patch — 2026-08-18
 * Mantiene el HTML/diseño actual y corrige:
 * 1) mayorista inicial calculado sobre subtotal mayorista;
 * 2) recompra $10.000 / 10 artículos validada por backend;
 * 3) límite de cantidad según stock real.
 */
(() => {
  const CART_KEY = "ithiel-cart";
  const API = "https://bfuexiblfuqwykktltrp.supabase.co/functions/v1/";
  const CATALOG_URL = API + "web-catalog";
  const ORDER_URL = API + "create-order";
  const FALLBACK_API_KEY = "sb_publishable_8-do7RGW8-li-7d1BnAsXQ_RYsks6iy";
  const stockCache = new Map();

  const readCart = () => {
    try {
      const value = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  };

  const money = (value) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);

  const itemKey = (item) => `${item?.productId || String(item?.id || "").split(":")[0]}:${item?.variantId || "base"}`;

  function pricing(items) {
    const qty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const retailTotal = items.reduce(
      (sum, item) => sum + Number(item.retailPrice || 0) * Number(item.qty || 0),
      0,
    );
    const wholesaleTotal = items.reduce(
      (sum, item) => sum + Number(item.wholesalePrice || 0) * Number(item.qty || 0),
      0,
    );
    return {
      qty,
      retailTotal,
      wholesaleTotal,
      initialWholesale: wholesaleTotal >= 30000 || qty >= 15,
      returningCandidate: wholesaleTotal >= 10000 || qty >= 10,
    };
  }

  function patchCartSummary() {
    const modal = document.querySelector("#cart-modal");
    if (!modal) return;
    const items = readCart();
    const state = pricing(items);
    const priceType = document.querySelector("#cart-price-type");
    const rule = document.querySelector("#cart-rule");
    const total = document.querySelector("#cart-total");

    if (state.initialWholesale) {
      if (priceType) {
        priceType.textContent = "Mayorista";
        priceType.className = "cart-price-type is-wholesale";
      }
      if (rule) {
        rule.className = "cart-rule ok";
        rule.textContent = "Precio mayorista aplicado.";
      }
      if (total) total.textContent = money(state.wholesaleTotal);
      return;
    }

    if (priceType) {
      priceType.textContent = "Minorista";
      priceType.className = "cart-price-type is-retail";
    }
    if (total) total.textContent = money(state.retailTotal);

    if (rule) {
      rule.className = "cart-rule warn";
      if (state.returningCandidate) {
        rule.textContent = "Si tu última compra mayorista fue en los últimos 30 días, se aplicará la condición de recompra al confirmar.";
      } else {
        const missingAmount = Math.max(0, 30000 - state.wholesaleTotal);
        const missingItems = Math.max(0, 15 - state.qty);
        rule.textContent = `Faltan ${money(missingAmount)} o ${missingItems} ${missingItems === 1 ? "artículo" : "artículos"} para la primera compra mayorista.`;
      }
    }
  }

  async function fetchStock(item) {
    const key = itemKey(item);
    if (stockCache.has(key)) return stockCache.get(key);
    const productId = item?.productId || String(item?.id || "").split(":")[0];
    if (!productId) return null;

    const response = await fetch(`${CATALOG_URL}?productId=${encodeURIComponent(productId)}`);
    if (!response.ok) throw new Error("No se pudo validar el stock.");
    const payload = await response.json();
    const product = payload?.product || payload;
    let stock = Number(product?.stock);

    if (item?.variantId) {
      const variants = Array.isArray(product?.variants) ? product.variants : [];
      const variant = variants.find((entry) => String(entry?.id) === String(item.variantId));
      stock = Number(variant?.stock);
    }

    if (!Number.isFinite(stock) || stock < 0) return null;
    stockCache.set(key, stock);
    return stock;
  }

  function notify(message) {
    const toast = document.querySelector("#cart-toast");
    if (toast) {
      toast.textContent = message;
      toast.classList.add("show");
      clearTimeout(window.__ithielCartFixToast);
      window.__ithielCartFixToast = setTimeout(() => toast.classList.remove("show"), 1800);
    } else {
      alert(message);
    }
  }

  // Captura el + antes del listener original. Si todavía no conocemos el stock,
  // lo consulta y reintenta el mismo click una sola vez.
  document.addEventListener(
    "click",
    async (event) => {
      const plus = event.target.closest("[data-cart-plus]");
      if (!plus) return;
      const index = Number(plus.dataset.cartPlus);
      const item = readCart()[index];
      if (!item) return;
      const key = itemKey(item);

      if (stockCache.has(key)) {
        const stock = stockCache.get(key);
        if (Number(item.qty || 0) >= stock) {
          event.preventDefault();
          event.stopImmediatePropagation();
          notify(`Stock disponible: ${stock}.`);
        }
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        const stock = await fetchStock(item);
        if (stock === null) {
          notify("No se pudo validar el stock. Probá nuevamente.");
          return;
        }
        if (Number(item.qty || 0) >= stock) {
          notify(`Stock disponible: ${stock}.`);
          return;
        }
        plus.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      } catch (_) {
        notify("No se pudo validar el stock. Probá nuevamente.");
      }
    },
    true,
  );

  async function validateAllStock(items) {
    for (const item of items) {
      const stock = await fetchStock(item);
      if (stock !== null && Number(item.qty || 0) > stock) {
        throw new Error(`${item.title || "Un producto"}: quedan ${stock} unidades disponibles.`);
      }
    }
  }

  async function requestOrder(purchaseType, items) {
    const fullName = document.querySelector("#cart-full-name")?.value.trim() || "";
    const phone = document.querySelector("#cart-phone")?.value.replace(/\D/g, "") || "";
    const fulfillmentType = document.querySelector("input[name='cart-delivery']:checked")?.value || "pickup";
    const shippingAddress = document.querySelector("#cart-address")?.value.trim() || "";
    const trackingOpen = document.querySelector("#cart-tracking-toggle")?.getAttribute("aria-expanded") === "true";
    const trackingRequested = Boolean(trackingOpen && fullName && phone.length >= 10);

    if (fulfillmentType === "shipping" && !shippingAddress) {
      throw new Error("Ingresá la dirección de envío.");
    }

    const session = (await window.ithielSupabase?.auth.getSession())?.data?.session;
    const headers = {
      "Content-Type": "application/json",
      apikey: window.ithielSupabasePublishableKey || FALLBACK_API_KEY,
    };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

    const response = await fetch(ORDER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        fullName,
        phone,
        trackingRequested,
        purchaseType,
        couponCode: document.querySelector("#cart-coupon")?.value.trim() || "",
        items: items.map((item) => ({
          productId: item.productId || String(item.id || "").split(":")[0],
          variantId: item.variantId || null,
          quantity: Number(item.qty || 0),
        })),
        fulfillmentType,
        shippingAddress,
        customerNote: document.querySelector("#cart-note")?.value.trim() || "",
        whatsappOptIn: false,
        website: "",
      }),
    });

    let data = {};
    try { data = await response.json(); } catch (_) {}
    return { response, data };
  }

  // Reemplaza solamente el submit del checkout, sin cambiar el diseño.
  document.addEventListener(
    "click",
    async (event) => {
      const button = event.target.closest("#cart-send");
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const items = readCart();
      if (!items.length) {
        alert("Tu pedido está vacío.");
        return;
      }

      button.disabled = true;
      const originalLabel = button.textContent;
      button.textContent = "Creando pedido...";

      try {
        await validateAllStock(items);
        const state = pricing(items);
        let purchaseType = state.initialWholesale || state.returningCandidate ? "wholesale" : "retail";
        let result = await requestOrder(purchaseType, items);

        // Un pedido que alcanza $10.000/10 artículos puede ser recompra.
        // El backend conoce el historial. Si no tiene recompra vigente, vuelve a minorista.
        if (
          purchaseType === "wholesale" &&
          !state.initialWholesale &&
          !result.response.ok &&
          String(result.data?.error || "").includes("Compra mayorista mínima")
        ) {
          purchaseType = "retail";
          result = await requestOrder("retail", items);
        }

        if (!result.response.ok) {
          throw new Error(result.data?.error || "No se pudo crear el pedido.");
        }

        localStorage.setItem(CART_KEY, "[]");
        window.location.href = result.data.whatsappUrl;
      } catch (error) {
        alert(error?.message || "No se pudo crear el pedido.");
      } finally {
        button.disabled = false;
        button.textContent = originalLabel || "Realizar compra por WhatsApp";
      }
    },
    true,
  );

  document.addEventListener("click", (event) => {
    if (event.target.closest(".cart-button,[data-cart-plus],[data-cart-minus],[data-cart-remove]")) {
      setTimeout(patchCartSummary, 0);
    }
  });

  window.addEventListener("DOMContentLoaded", patchCartSummary, { once: true });
  const modal = document.querySelector("#cart-modal");
  if (modal) {
    new MutationObserver(() => {
      if (modal.classList.contains("open")) setTimeout(patchCartSummary, 0);
    }).observe(modal, { attributes: true, attributeFilter: ["class"] });
  }
})();
