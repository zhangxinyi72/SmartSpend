import { confirmPasswordReset, loginUser, requestPasswordReset } from "./api.js";
import { initPasswordToggles, redirectIfAuthenticated, saveAuthSession } from "./utils.js";

redirectIfAuthenticated();
initPasswordToggles();

// Fallback: ensure main login password toggle always works.
// (Keeps behavior unchanged when utils binding is already active.)
const loginPasswordToggleBtn = document.querySelector('[data-password-toggle="password"]');
const loginPasswordField = document.getElementById("password");
if (
    loginPasswordToggleBtn &&
    loginPasswordField &&
    loginPasswordToggleBtn.dataset.bound !== "true"
) {
    loginPasswordToggleBtn.addEventListener("click", () => {
        const shouldShow = loginPasswordField.type === "password";
        loginPasswordField.type = shouldShow ? "text" : "password";
        loginPasswordToggleBtn.textContent = shouldShow ? "Hide" : "Show";
        loginPasswordToggleBtn.setAttribute("aria-pressed", String(shouldShow));
    });
}

const loginForm = document.getElementById("loginForm");
const errorMessage = document.getElementById("errorMessage");
const submitBtn = document.getElementById("login-submit-btn");
const emailInput = document.getElementById("email");
const emailFormatHint = document.getElementById("email-format-hint");
const passwordInput = document.getElementById("password");

const EMAIL_INVALID_MSG =
    "That doesn’t look like a valid email. Use a format like name@gmail.com.";

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function setEmailFormatHint(visible, message = EMAIL_INVALID_MSG) {
    if (!emailFormatHint) return;
    if (visible) {
        emailFormatHint.hidden = false;
        emailFormatHint.textContent = message;
        emailInput.setAttribute("aria-invalid", "true");
    } else {
        emailFormatHint.hidden = true;
        emailFormatHint.textContent = "";
        emailInput.removeAttribute("aria-invalid");
    }
}

emailInput.addEventListener("blur", () => {
    const v = emailInput.value.trim();
    if (v && !isValidEmail(v)) {
        setEmailFormatHint(true);
    } else {
        setEmailFormatHint(false);
    }
});

emailInput.addEventListener("input", () => {
    if (!emailFormatHint || emailFormatHint.hidden) return;
    if (isValidEmail(emailInput.value.trim())) {
        setEmailFormatHint(false);
    }
});
const forgotPasswordToggle = document.getElementById("forgot-password-toggle");
const forgotPasswordPanel = document.getElementById("forgot-password-panel");
const resetEmailInput = document.getElementById("reset-email");
const resetCodeInput = document.getElementById("reset-code");
const newPasswordInput = document.getElementById("new-password");
const confirmNewPasswordInput = document.getElementById("confirm-new-password");
const forgotPasswordMessage = document.getElementById("forgotPasswordMessage");
const sendResetCodeBtn = document.getElementById("send-reset-code-btn");
const resetPasswordBtn = document.getElementById("reset-password-btn");

function setForgotPasswordMessage(message = "", state = "") {
    forgotPasswordMessage.textContent = message;
    if (state) {
        forgotPasswordMessage.dataset.state = state;
    } else {
        delete forgotPasswordMessage.dataset.state;
    }
}

function setLoginBanner(message = "", state = "") {
    errorMessage.textContent = message;
    if (state) {
        errorMessage.dataset.state = state;
    } else {
        delete errorMessage.dataset.state;
    }
}

function syncResetEmail() {
    const loginEmail = emailInput.value.trim();
    if (loginEmail && !resetEmailInput.value.trim()) {
        resetEmailInput.value = loginEmail;
    }
}

forgotPasswordToggle.addEventListener("click", () => {
    const shouldOpen = forgotPasswordPanel.hidden;
    forgotPasswordPanel.hidden = !shouldOpen;
    forgotPasswordToggle.setAttribute("aria-expanded", String(shouldOpen));

    if (shouldOpen) {
        syncResetEmail();
        setForgotPasswordMessage("");
        resetCodeInput.focus();
        if (!resetEmailInput.value.trim()) {
            resetEmailInput.focus();
        }
    }
});

sendResetCodeBtn.addEventListener("click", async () => {
    const email = resetEmailInput.value.trim() || emailInput.value.trim();

    if (!email) {
        setForgotPasswordMessage("Enter your account email first.", "error");
        resetEmailInput.focus();
        return;
    }

    resetEmailInput.value = email;
    setForgotPasswordMessage("");
    sendResetCodeBtn.disabled = true;
    sendResetCodeBtn.textContent = "Sending...";

    try {
        const data = await requestPasswordReset(email);
        setForgotPasswordMessage(data.message, "success");
        resetCodeInput.focus();
    } catch (error) {
        setForgotPasswordMessage(error.message, "error");
    } finally {
        sendResetCodeBtn.disabled = false;
        sendResetCodeBtn.textContent = "Send Code";
    }
});

resetPasswordBtn.addEventListener("click", async () => {
    const email = resetEmailInput.value.trim() || emailInput.value.trim();
    const code = resetCodeInput.value.trim();
    const newPassword = newPasswordInput.value.trim();
    const confirmNewPassword = confirmNewPasswordInput.value.trim();

    if (!email || !code || !newPassword || !confirmNewPassword) {
        setForgotPasswordMessage("Complete all fields before updating your password.", "error");
        return;
    }

    if (newPassword.length < 8) {
        setForgotPasswordMessage("Your new password must be at least 8 characters long.", "error");
        return;
    }

    if (newPassword !== confirmNewPassword) {
        setForgotPasswordMessage("The new passwords do not match.", "error");
        return;
    }

    resetPasswordBtn.disabled = true;
    resetPasswordBtn.textContent = "Updating...";
    setForgotPasswordMessage("");

    try {
        const data = await confirmPasswordReset({ email, code, newPassword });
        setForgotPasswordMessage(data.message, "success");
        setLoginBanner("Password reset successful. Please sign in with your new password.", "success");
        emailInput.value = email;
        passwordInput.value = "";
        resetCodeInput.value = "";
        newPasswordInput.value = "";
        confirmNewPasswordInput.value = "";
        forgotPasswordPanel.hidden = true;
        forgotPasswordToggle.setAttribute("aria-expanded", "false");
        passwordInput.focus();
    } catch (error) {
        setForgotPasswordMessage(error.message, "error");
    } finally {
        resetPasswordBtn.disabled = false;
        resetPasswordBtn.textContent = "Update Password";
    }
});

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    setLoginBanner("");
    setEmailFormatHint(false);

    if (!isValidEmail(email)) {
        setLoginBanner(EMAIL_INVALID_MSG, "error");
        setEmailFormatHint(true);
        emailInput.focus();
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Signing In...";

    try {
        const data = await loginUser(email, password);
        saveAuthSession(data);
        window.location.href = "./home.html";
    } catch (error) {
        setLoginBanner(error.message, "error");
        submitBtn.disabled = false;
        submitBtn.textContent = "Sign In";
    }
});
