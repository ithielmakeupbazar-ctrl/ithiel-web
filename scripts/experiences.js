import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabase = createClient(
  "https://bfuexiblfuqwykktltrp.supabase.co",
  "sb_publishable_8-do7RGW8-li-7d1BnAsXQ_RYsks6iy"
);
const list = document.querySelector(".review-list");
const summary = document.querySelector(".review-summary");
const message = document.querySelector("#comment-message");

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
})[char]);

const maskName = value => {
  const name = String(value || "Clienta").trim().split(/\s+/)[0];
  return name.length < 3 ? `${name[0] || "C"}***` : `${name.slice(0, Math.ceil(name.length / 2))}${"*".repeat(Math.floor(name.length / 2))}`;
};

async function loadExperiences() {
  const { data, error } = await supabase
    .from("experiences")
    .select("display_name,rating,comment,created_at")
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) {
    console.warn("Experiencias pendientes de configurar en Supabase:", error.message);
    return;
  }
  if (!data?.length) {
    list.innerHTML = "<p>Todavía no hay experiencias publicadas.</p>";
    summary.querySelector("strong").textContent = "0";
    summary.querySelector("small").textContent = "Sé la primera en comentar";
    return;
  }
  const average = data.reduce((sum, item) => sum + Number(item.rating), 0) / data.length;
  summary.querySelector("strong").textContent = average.toFixed(1);
  summary.querySelector("small").textContent = `${data.length} experiencias reales`;
  list.innerHTML = data.map(item => `<article class="review-card"><span class="stars">${"★".repeat(item.rating)}${"☆".repeat(5 - item.rating)}</span><p>“${escapeHtml(item.comment)}”</p><small>${escapeHtml(maskName(item.display_name))}</small></article>`).join("");
}

window.addEventListener("ithiel-submit-experience", async event => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    message.textContent = "Ingresá en Mi cuenta para publicar.";
    return;
  }
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Clienta";
  const { error } = await supabase.from("experiences").insert({
    user_id: user.id,
    display_name: displayName,
    rating: event.detail.rating,
    comment: event.detail.comment.trim()
  });
  message.textContent = error ? "No se pudo enviar. Revisá la configuración de Supabase." : "Comentario enviado. Se publicará después de revisarlo.";
  if (!error) document.querySelector("#comment-form").reset();
});

loadExperiences();
