import { supabase } from "./supabase-client.js?v=20260802-authfix";

const form = document.querySelector("#register-modal form");
const submit = form?.querySelector(".auth-action");
if (form && submit) {
  const inputs = form.querySelectorAll("input");
  const nameInput = inputs[0];
  const emailInput = inputs[1];
  const passwordInput = form.querySelector("#register-password");
  const confirmInput = form.querySelector("#register-confirm");
  const message = document.createElement("p");
  message.id = "popup-register-message";
  message.className = "auth-message";
  form.insertBefore(message, submit);

  submit.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!name || !email || password.length < 6) {
      message.textContent = "Completá nombre, email y una contraseña de 6 caracteres o más.";
      return;
    }
    if (password !== confirmInput.value) {
      message.textContent = "Las contraseñas no coinciden.";
      return;
    }
    submit.disabled = true;
    submit.textContent = "Creando cuenta...";
    message.textContent = "";
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/cuenta`,
      },
    });
    submit.disabled = false;
    submit.textContent = "Crear cuenta";
    if (error) {
      message.textContent = error.message;
      return;
    }
    message.textContent = data.session
      ? "Cuenta creada. Ya podés ingresar."
      : "Cuenta creada. Revisá tu email para confirmarla.";
  });
}
