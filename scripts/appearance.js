/* Ithiel: apariencia compartida entre tienda y administración. */
(() => {
  const KEY = "ithiel-appearance";
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const modes = new Set(["light", "dark", "system"]);
  let volatilePreference = null;

  function preference() {
    try {
      const saved = localStorage.getItem(KEY);
      return modes.has(saved) ? saved : (volatilePreference || "light");
    } catch (_) { return volatilePreference || "light"; }
  }
  function effective(mode) {
    return mode === "system" ? (media.matches ? "dark" : "light") : mode;
  }
  function refresh() {
    const chosen = preference();
    const active = effective(chosen);
    root.dataset.theme = active;
    root.dataset.themePreference = chosen;
    root.style.colorScheme = active;
    document.querySelectorAll("[data-ithiel-theme-select]").forEach(select => {
      select.value = chosen;
      select.setAttribute("aria-label", "Apariencia: " + (chosen === "system" ? "Sistema" : chosen === "dark" ? "Oscuro" : "Claro"));
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = active === "dark" ? "#160f16" : "#851044";
  }
  function mount() {
    document.querySelectorAll("[data-ithiel-theme-switch]").forEach(host => {
      if (host.querySelector("select")) return;
      const label = document.createElement("label");
      label.className = "ithiel-theme-switch";
      const text = document.createElement("span");
      text.textContent = "Apariencia";
      const select = document.createElement("select");
      select.dataset.ithielThemeSelect = "";
      for (const [value, title] of [["light", "Claro"], ["dark", "Oscuro"], ["system", "Sistema"]]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = title;
        select.append(option);
      }
      select.addEventListener("change", () => {
        volatilePreference = select.value;
        try { localStorage.setItem(KEY, select.value); } catch (_) {}
        // Aplica incluso si el almacenamiento no está disponible.
        root.dataset.themePreference = select.value;
        root.dataset.theme = effective(select.value);
        root.style.colorScheme = root.dataset.theme;
        refresh();
      });
      label.append(text, select);
      host.append(label);
    });
    refresh();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
  if (media.addEventListener) media.addEventListener("change", () => { if (preference() === "system") refresh(); });
  else if (media.addListener) media.addListener(() => { if (preference() === "system") refresh(); });
  window.addEventListener("storage", event => { if (event.key === KEY) refresh(); });
})();
