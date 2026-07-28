import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabase = createClient(
  "https://bfuexiblfuqwykktltrp.supabase.co",
  "sb_publishable_8-do7RGW8-li-7d1BnAsXQ_RYsks6iy",
);

const form = document.querySelector("#account-modal form");
const submit = form?.querySelector(".auth-action");
if (form && submit) {
  const emailInput = form.querySelector("input[type=email]");
  const passwordInput = form.querySelector("#account-password");
  const message = document.createElement("p");
  message.id = "popup-login-message";
  message.className = "auth-message";
  form.insertBefore(message, submit);

  submit.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      message.textContent = "Ingresá tu email y contraseña.";
      return;
    }
    submit.disabled = true;
    submit.textContent = "Ingresando...";
    message.textContent = "";
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      submit.disabled = false;
      submit.textContent = "Ingresar";
      message.textContent = "Email o contraseña incorrectos.";
      return;
    }
    window.location.assign("cuenta.html");
  });
}
