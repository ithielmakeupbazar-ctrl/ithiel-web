(() => {
  if (document.querySelector(".cart-button")) return;
  const KEY = "ithiel-cart";
  const WHATSAPP = "5493413038668";
  const CATALOG_URL = "https://bfuexiblfuqwykktltrp.supabase.co/functions/v1/web-catalog";
  const stockCache = new Map();
  const money = value => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(value) || 0);
  const read = () => {
    try { const value = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
  };
  const save = items => localStorage.setItem(KEY, JSON.stringify(items));
  const pricing = items => {
    const qty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const retail = items.reduce((sum, item) => sum + Number(item.retailPrice || 0) * Number(item.qty || 0), 0);
    const wholesaleTotal = items.reduce((sum, item) => sum + Number(item.wholesalePrice || 0) * Number(item.qty || 0), 0);
    return {
      qty,
      retail,
      wholesaleTotal,
      wholesale: wholesaleTotal >= 30000 || qty >= 15,
      returningCandidate: wholesaleTotal >= 10000 || qty >= 10,
    };
  };
  const itemKey = item => `${item?.productId || String(item?.id || "").split(":")[0]}:${item?.variantId || "base"}`;

  async function fetchStock(item) {
    const key = itemKey(item);
    if (stockCache.has(key)) return stockCache.get(key);
    const productId = item?.productId || String(item?.id || "").split(":")[0];
    if (!productId) return null;
    const response = await fetch(`${CATALOG_URL}?productId=${encodeURIComponent(productId)}`);
    if (!response.ok) return null;
    const payload = await response.json();
    const product = payload?.product || payload;
    let stock = Number(product?.stock);
    if (item?.variantId) {
      const variant = (product?.variants || []).find(entry => String(entry?.id) === String(item.variantId));
      stock = Number(variant?.stock);
    }
    if (!Number.isFinite(stock) || stock < 0) return null;
    stockCache.set(key, stock);
    return stock;
  }

  document.body.insertAdjacentHTML("beforeend", `
    <button class="ithiel-shared-cart" type="button">Mi pedido <span>0</span></button>
    <div class="ithiel-shared-modal" aria-hidden="true">
      <div class="ithiel-shared-backdrop" data-cart-close></div>
      <section class="ithiel-shared-panel">
        <button class="ithiel-shared-close" type="button" data-cart-close aria-label="Cerrar">×</button>
        <h2>Mi pedido</h2>
        <div data-cart-items></div>
        <div class="ithiel-shared-total"><span>Total</span><strong data-cart-total>$0</strong></div>
        <p class="ithiel-shared-rule" data-cart-rule></p>
        <button class="ithiel-shared-send" type="button">Continuar por WhatsApp</button>
      </section>
    </div>`);
  const button = document.querySelector(".ithiel-shared-cart");
  const modal = document.querySelector(".ithiel-shared-modal");
  const render = () => {
    const items = read();
    const state = pricing(items);
    const total = state.wholesale ? state.wholesaleTotal : state.retail;
    button.querySelector("span").textContent = state.qty;
    modal.querySelector("[data-cart-items]").innerHTML = items.length ? items.map((item, index) => `
      <article class="ithiel-shared-item"><div><strong>${item.title}</strong><small>${money(state.wholesale ? item.wholesalePrice : item.retailPrice)}</small></div>
      <div class="ithiel-shared-actions"><button data-minus="${index}">−</button><span>${item.qty}</span><button data-plus="${index}">+</button><button data-remove="${index}">×</button></div></article>`).join("") : "<p>Tu pedido está vacío.</p>";
    modal.querySelector("[data-cart-total]").textContent = money(total);
    modal.querySelector("[data-cart-rule]").textContent = state.wholesale
      ? "Precio mayorista aplicado."
      : state.returningCandidate
        ? "Si tenés una compra mayorista dentro de los últimos 30 días, la condición de recompra se confirma al finalizar."
        : "Precio minorista. Primera compra mayorista desde $30.000 de subtotal mayorista o 15 artículos.";
  };
  button.addEventListener("click", () => { render(); modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); });
  modal.addEventListener("click", async event => {
    if (event.target.closest("[data-cart-close]")) { modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true"); return; }
    const items = read();
    const plus = event.target.closest("[data-plus]");
    const minus = event.target.closest("[data-minus]");
    const remove = event.target.closest("[data-remove]");
    if (plus) {
      const index = Number(plus.dataset.plus);
      const stock = await fetchStock(items[index]);
      if (stock !== null && Number(items[index].qty || 0) >= stock) {
        alert(`Stock disponible: ${stock}.`);
        return;
      }
      items[index].qty += 1;
    }
    if (minus) items[Number(minus.dataset.minus)].qty = Math.max(1, items[Number(minus.dataset.minus)].qty - 1);
    if (remove) items.splice(Number(remove.dataset.remove), 1);
    if (plus || minus || remove) { save(items); render(); }
  });
  modal.querySelector(".ithiel-shared-send").addEventListener("click", () => {
    const items = read();
    if (!items.length) return;
    const state = pricing(items);
    const lines = items.map(item => `${item.qty} x ${item.title} - ${money(state.wholesale ? item.wholesalePrice : item.retailPrice)}`).join("\n");
    const condition = state.wholesale
      ? "Compra mayorista."
      : state.returningCandidate
        ? "Posible recompra mayorista; confirmar condición de 30 días."
        : "Compra minorista.";
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hola, quiero realizar este pedido:\n\n${lines}\n\n${condition}`)}`, "_blank");
    save([]);
    render();
    modal.classList.remove("open");
  });
  window.addEventListener("storage", render);
  render();
})();
