(() => {
  if (document.querySelector(".cart-button")) return;
  const KEY = "ithiel-cart";
  const WHATSAPP = "5493413038668";
  const money = value => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(value) || 0);
  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
  };
  const save = items => localStorage.setItem(KEY, JSON.stringify(items));
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
    const qty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const retail = items.reduce((sum, item) => sum + Number(item.retailPrice || 0) * Number(item.qty || 0), 0);
    const wholesale = retail >= 30000 || qty >= 15;
    const total = items.reduce((sum, item) => sum + Number(wholesale ? item.wholesalePrice : item.retailPrice) * Number(item.qty || 0), 0);
    button.querySelector("span").textContent = qty;
    modal.querySelector("[data-cart-items]").innerHTML = items.length ? items.map((item, index) => `
      <article class="ithiel-shared-item"><div><strong>${item.title}</strong><small>${money(wholesale ? item.wholesalePrice : item.retailPrice)}</small></div>
      <div class="ithiel-shared-actions"><button data-minus="${index}">−</button><span>${item.qty}</span><button data-plus="${index}">+</button><button data-remove="${index}">×</button></div></article>`).join("") : "<p>Tu pedido está vacío.</p>";
    modal.querySelector("[data-cart-total]").textContent = money(total);
    modal.querySelector("[data-cart-rule]").textContent = wholesale ? "Precio mayorista aplicado." : "Precio minorista. Mayorista desde $30.000 o 15 artículos.";
  };
  button.addEventListener("click", () => { render(); modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); });
  modal.addEventListener("click", event => {
    if (event.target.closest("[data-cart-close]")) { modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true"); return; }
    const items = read();
    const plus = event.target.closest("[data-plus]");
    const minus = event.target.closest("[data-minus]");
    const remove = event.target.closest("[data-remove]");
    if (plus) items[Number(plus.dataset.plus)].qty += 1;
    if (minus) items[Number(minus.dataset.minus)].qty = Math.max(1, items[Number(minus.dataset.minus)].qty - 1);
    if (remove) items.splice(Number(remove.dataset.remove), 1);
    if (plus || minus || remove) { save(items); render(); }
  });
  modal.querySelector(".ithiel-shared-send").addEventListener("click", () => {
    const items = read();
    if (!items.length) return;
    const qty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const retail = items.reduce((sum, item) => sum + Number(item.retailPrice || 0) * Number(item.qty || 0), 0);
    const wholesale = retail >= 30000 || qty >= 15;
    const lines = items.map(item => `${item.qty} x ${item.title} - ${money(wholesale ? item.wholesalePrice : item.retailPrice)}`).join("\n");
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hola, quiero realizar este pedido:\n\n${lines}\n\nCompra ${wholesale ? "mayorista" : "minorista"}.`)}`, "_blank");
    save([]);
    render();
    modal.classList.remove("open");
  });
  window.addEventListener("storage", render);
  render();
})();
