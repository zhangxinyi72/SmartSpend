import { registerUser } from "./api.js";
import { initPasswordToggles, redirectIfAuthenticated, saveAuthSession } from "./utils.js";

redirectIfAuthenticated();
initPasswordToggles();

const registerForm = document.getElementById("registerForm");
const errorMessage = document.getElementById("registerErrorMessage");
const submitBtn = document.getElementById("register-submit-btn");

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("register-name").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    const confirmPassword = document.getElementById("register-confirm-password").value;

    errorMessage.textContent = "";

    if (!name || !email || !password || !confirmPassword) {
        errorMessage.textContent = "Please complete all fields.";
        return;
    }

    if (password.length < 8) {
        errorMessage.textContent = "Password must be at least 8 characters long.";
        return;
    }

    if (password !== confirmPassword) {
        errorMessage.textContent = "Passwords do not match.";
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Creating Account...";

    try {
        const data = await registerUser({ name, email, password });
        saveAuthSession(data);
        window.location.href = "./home.html";
    } catch (error) {
        errorMessage.textContent = error.message;
        submitBtn.disabled = false;
        submitBtn.textContent = "Create Account";
    }
});
