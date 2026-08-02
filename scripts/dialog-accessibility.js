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
