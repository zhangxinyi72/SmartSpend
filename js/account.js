import {
    getProfile,
    logoutUser,
    sendTestEmail,
    sendVerificationEmail,
    updateAccountSettings,
    updateProfile,
    verifyEmailCode
} from "./api.js";
import {
    clearAuthSession,
    getStoredToken,
    getStoredUser,
    requireAuth,
    saveAuthSession,
    showToast
} from "./utils.js";

if (!requireAuth()) {
    throw new Error("Authentication required");
}

const defaultAccountSettings = {
    emailVerified: false,
    emailNotificationsEnabled: true,
    budgetAlertsEnabled: true,
    budgetAlertThreshold: 0.8,
    verificationEmailSentAt: null
};

let profile = {
    ...(getStoredUser() || {}),
    phone: "",
    location: "",
    memberSince: "",
    memberStatus: "",
    accountSettings: {
        ...defaultAccountSettings,
        ...(getStoredUser()?.accountSettings || {})
    }
};

const nameEl = document.getElementById("account-name");
const emailEl = document.getElementById("account-email");
const phoneEl = document.getElementById("account-phone");
const locationEl = document.getElementById("account-location");
const memberSinceEl = document.getElementById("account-member-since");
const memberStatusEl = document.getElementById("account-member-status");

const editBtn = document.getElementById("edit-profile-btn");
const modal = document.getElementById("profile-modal");
const closeModalBtn = document.getElementById("close-profile-modal");
const cancelBtn = document.getElementById("cancel-profile-btn");
const profileForm = document.getElementById("profile-form");

const inputName = document.getElementById("profile-name");
const inputEmail = document.getElementById("profile-email");
const inputPhone = document.getElementById("profile-phone");
const inputLocation = document.getElementById("profile-location");
const inputMemberSince = document.getElementById("profile-member-since");
const logoutBtn = document.getElementById("logout-btn");

const verificationStatusEl = document.getElementById("verification-status");
const verificationHintEl = document.getElementById("verification-hint");
const sendVerificationBtn = document.getElementById("send-verification-btn");
const verificationCodeInput = document.getElementById("verification-code");
const verifyEmailBtn = document.getElementById("verify-email-btn");

const emailNotificationsStatusEl = document.getElementById("email-notifications-status");
const emailNotificationsToggle = document.getElementById("email-notifications-toggle");
const sendTestEmailBtn = document.getElementById("send-test-email-btn");

const budgetAlertsStatusEl = document.getElementById("budget-alerts-status");
const budgetAlertsToggle = document.getElementById("budget-alerts-toggle");
const budgetAlertThresholdLabelEl = document.getElementById("budget-alert-threshold-label");

function getSettings() {
    return {
        ...defaultAccountSettings,
        ...(profile.accountSettings || {})
    };
}

function syncProfile(updatedUser) {
    profile = {
        ...profile,
        ...updatedUser,
        accountSettings: {
            ...defaultAccountSettings,
            ...(updatedUser.accountSettings || {})
        }
    };

    saveAuthSession({
        user: profile,
        token: getStoredToken()
    });

    renderProfile();
}

function setButtonLoading(button, loading, idleText, loadingText) {
    if (!button) return;
    button.disabled = loading;
    button.textContent = loading ? loadingText : idleText;
}

function setSwitchState(button, enabled) {
    if (!button) return;
    button.setAttribute("aria-pressed", String(enabled));
}

function updateStatusBadge(element, text, mode) {
    if (!element) return;
    element.textContent = text;
    element.classList.remove("enabled", "pending", "disabled");
    element.classList.add(mode);
}

function renderProfile() {
    if (nameEl) nameEl.textContent = profile.name || "SmartSpend User";
    if (emailEl) emailEl.textContent = profile.email || "—";
    if (phoneEl) phoneEl.textContent = profile.phone || "Not added yet";
    if (locationEl) locationEl.textContent = profile.location || "Not added yet";
    if (memberSinceEl) memberSinceEl.textContent = profile.memberSince || "—";
    if (memberStatusEl) memberStatusEl.textContent = profile.memberStatus || "SmartSpend Member";

    renderSettings();
}

function renderSettings() {
    const settings = getSettings();
    const thresholdPercent = Math.round(Number(settings.budgetAlertThreshold || 0.8) * 100);

    if (settings.emailVerified) {
        updateStatusBadge(verificationStatusEl, "Verified", "enabled");
        if (verificationHintEl) verificationHintEl.textContent = `Verified address: ${profile.email}`;
        if (sendVerificationBtn) sendVerificationBtn.textContent = "Resend Email";
        if (verificationCodeInput) {
            verificationCodeInput.value = "";
            verificationCodeInput.disabled = false;
        }
        if (verifyEmailBtn) verifyEmailBtn.disabled = false;
    } else if (settings.verificationEmailSentAt) {
        updateStatusBadge(verificationStatusEl, "Code sent", "pending");
        if (verificationHintEl) verificationHintEl.textContent = `A verification code was sent to ${profile.email}`;
        if (sendVerificationBtn) sendVerificationBtn.textContent = "Resend Email";
        if (verificationCodeInput) verificationCodeInput.disabled = false;
        if (verifyEmailBtn) verifyEmailBtn.disabled = false;
    } else {
        updateStatusBadge(verificationStatusEl, "Not verified", "disabled");
        if (verificationHintEl) verificationHintEl.textContent = "Confirm this email before receiving alerts";
        if (sendVerificationBtn) sendVerificationBtn.textContent = "Send Email";
        if (verificationCodeInput) verificationCodeInput.disabled = false;
        if (verifyEmailBtn) verifyEmailBtn.disabled = false;
    }

    updateStatusBadge(
        emailNotificationsStatusEl,
        settings.emailNotificationsEnabled ? "On" : "Off",
        settings.emailNotificationsEnabled ? "enabled" : "disabled"
    );
    setSwitchState(emailNotificationsToggle, settings.emailNotificationsEnabled);

    updateStatusBadge(
        budgetAlertsStatusEl,
        settings.budgetAlertsEnabled ? "On" : "Off",
        settings.budgetAlertsEnabled ? "enabled" : "disabled"
    );
    setSwitchState(budgetAlertsToggle, settings.budgetAlertsEnabled);

    if (budgetAlertThresholdLabelEl) {
        budgetAlertThresholdLabelEl.textContent = `Notify when total spending reaches ${thresholdPercent}% of combined budgets`;
    }

    if (sendTestEmailBtn) {
        sendTestEmailBtn.disabled = !settings.emailVerified || !settings.emailNotificationsEnabled;
    }
}

function fillForm() {
    inputName.value = profile.name || "";
    inputEmail.value = profile.email || "";
    inputPhone.value = profile.phone || "";
    inputLocation.value = profile.location || "";
    inputMemberSince.value = profile.memberSince || "";
}

function openModal() {
    fillForm();
    modal.classList.add("visible");
    modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
    modal.classList.remove("visible");
    modal.setAttribute("aria-hidden", "true");
}

async function loadProfile() {
    try {
        const user = await getProfile();
        syncProfile(user);
    } catch (error) {
        console.error(error);
        showToast("Failed to load profile", "error");
    }
}

async function saveProfile(event) {
    event.preventDefault();

    const payload = {
        name: inputName.value.trim(),
        email: inputEmail.value.trim(),
        phone: inputPhone.value.trim(),
        location: inputLocation.value.trim(),
        memberSince: inputMemberSince.value.trim()
    };

    if (!payload.name || !payload.email) {
        showToast("Name and email are required", "error");
        return;
    }

    try {
        const updatedUser = await updateProfile(payload);
        syncProfile(updatedUser);
        closeModal();
        showToast("Profile updated successfully");
    } catch (error) {
        console.error(error);
        showToast(error.message || "Failed to update profile", "error");
    }
}

async function handleSettingsUpdate(patch, successMessage) {
    const response = await updateAccountSettings(patch);
    if (response.user) {
        syncProfile(response.user);
    }
    showToast(successMessage);
}

async function handleSendVerificationEmail() {
    setButtonLoading(sendVerificationBtn, true, "Send Email", "Sending...");

    try {
        const response = await sendVerificationEmail();
        if (response.user) {
            syncProfile(response.user);
        }
        showToast(response.message || "Verification email sent");
    } catch (error) {
        console.error(error);
        showToast(error.message || "Failed to send verification email", "error");
    } finally {
        setButtonLoading(sendVerificationBtn, false, "Send Email", "Sending...");
        renderSettings();
    }
}

async function handleVerifyEmail() {
    const code = verificationCodeInput.value.trim();
    if (!code) {
        showToast("Enter the 6-digit verification code", "error");
        return;
    }

    setButtonLoading(verifyEmailBtn, true, "Verify", "Checking...");

    try {
        const response = await verifyEmailCode(code);
        if (response.user) {
            syncProfile(response.user);
        }
        verificationCodeInput.value = "";
        showToast(response.message || "Email verified");
    } catch (error) {
        console.error(error);
        showToast(error.message || "Failed to verify email", "error");
    } finally {
        setButtonLoading(verifyEmailBtn, false, "Verify", "Checking...");
        renderSettings();
    }
}

async function handleSendTestEmail() {
    setButtonLoading(sendTestEmailBtn, true, "Send Test", "Sending...");

    try {
        const response = await sendTestEmail();
        showToast(response.message || "Test email sent");
    } catch (error) {
        console.error(error);
        showToast(error.message || "Failed to send test email", "error");
    } finally {
        setButtonLoading(sendTestEmailBtn, false, "Send Test", "Sending...");
        renderSettings();
    }
}

async function toggleEmailNotifications() {
    const nextValue = !getSettings().emailNotificationsEnabled;
    emailNotificationsToggle.disabled = true;

    try {
        await handleSettingsUpdate(
            { emailNotificationsEnabled: nextValue },
            `Email notifications ${nextValue ? "enabled" : "disabled"}`
        );
    } catch (error) {
        console.error(error);
        showToast(error.message || "Failed to update email notifications", "error");
    } finally {
        emailNotificationsToggle.disabled = false;
        renderSettings();
    }
}

async function toggleBudgetAlerts() {
    const nextValue = !getSettings().budgetAlertsEnabled;
    budgetAlertsToggle.disabled = true;

    try {
        await handleSettingsUpdate(
            { budgetAlertsEnabled: nextValue },
            `Budget alerts ${nextValue ? "enabled" : "disabled"}`
        );
    } catch (error) {
        console.error(error);
        showToast(error.message || "Failed to update budget alerts", "error");
    } finally {
        budgetAlertsToggle.disabled = false;
        renderSettings();
    }
}

if (editBtn) editBtn.addEventListener("click", openModal);
if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
if (profileForm) profileForm.addEventListener("submit", saveProfile);

if (modal) {
    modal.addEventListener("click", (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("visible")) {
        closeModal();
    }
});

if (sendVerificationBtn) {
    sendVerificationBtn.addEventListener("click", handleSendVerificationEmail);
}

if (verifyEmailBtn) {
    verifyEmailBtn.addEventListener("click", handleVerifyEmail);
}

if (verificationCodeInput) {
    verificationCodeInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            handleVerifyEmail();
        }
    });
}

if (emailNotificationsToggle) {
    emailNotificationsToggle.addEventListener("click", toggleEmailNotifications);
}

if (budgetAlertsToggle) {
    budgetAlertsToggle.addEventListener("click", toggleBudgetAlerts);
}

if (sendTestEmailBtn) {
    sendTestEmailBtn.addEventListener("click", handleSendTestEmail);
}

if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        logoutBtn.disabled = true;
        logoutBtn.textContent = "Logging Out...";

        try {
            await logoutUser();
        } catch (error) {
            console.error(error);
        } finally {
            clearAuthSession();
            showToast("Logged out successfully");
            setTimeout(() => {
                window.location.href = "./index.html";
            }, 300);
        }
    });
}

renderProfile();
loadProfile();
