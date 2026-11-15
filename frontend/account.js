const ACCOUNT_API_BASE = "http://localhost:3000";

const accountState = {
    token: localStorage.getItem("token"),
    user: null,
};

const account$ = (selector) => document.querySelector(selector);

function accountHeaders(json = false) {
    const headers = {};
    if (accountState.token) {
        headers.Authorization = `Bearer ${accountState.token}`;
    }
    if (json) {
        headers["Content-Type"] = "application/json";
    }
    return headers;
}

async function accountApi(path, options = {}) {
    const isFormData = options.body instanceof FormData;
    const response = await fetch(`${ACCOUNT_API_BASE}${path}`, {
        ...options,
        headers: {
            ...accountHeaders(options.body && !isFormData),
            ...options.headers,
        },
    });

    let data = {};
    try {
        data = await response.json();
    } catch {
        // Response may have no JSON body.
    }

    if (!response.ok) {
        const error = new Error(data.message || `Request failed (${response.status})`);
        error.status = response.status;
        throw error;
    }

    return data;
}

function showAuthError(id, message = "") {
    const element = account$(`#${id}`);
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
}

function showAuthSuccess(id, message = "") {
    const element = account$(`#${id}`);
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
}

function switchAuthView(view) {
    const isLogin = view === "login";
    account$("#login-form").hidden = !isLogin;
    account$("#register-form").hidden = isLogin;

    account$("#show-login-button").classList.toggle("is-active", isLogin);
    account$("#show-register-button").classList.toggle("is-active", !isLogin);
    account$("#show-login-button").setAttribute("aria-selected", String(isLogin));
    account$("#show-register-button").setAttribute("aria-selected", String(!isLogin));

    account$("#auth-eyebrow").textContent = isLogin ? "Welcome back" : "Join your neighborhood";
    account$("#auth-title").textContent = isLogin ? "Sign in" : "Create account";
    account$("#auth-description").textContent = isLogin
        ? "Sign in to save services and manage your listings."
        : "Create an account to save favorites or offer local services.";

    showAuthError("login-error");
    showAuthError("register-error");
}

function getReturnUrl() {
    const params = new URLSearchParams(location.search);
    const returnTo = params.get("returnTo");

    // Prevent redirects outside this site.
    if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
        return returnTo;
    }
    if (returnTo && !returnTo.includes("://") && !returnTo.startsWith("\\")) {
        return returnTo;
    }
    return "index.html";
}

function finishSignIn(token) {
    localStorage.setItem("token", token);
    accountState.token = token;
    location.href = getReturnUrl();
}

function renderAccount(user) {
    accountState.user = user;
    account$("#auth-view").hidden = true;
    account$("#account-view").hidden = false;

    account$("#profile-name").textContent = user.name || "LocalLoop member";
    account$("#profile-email").textContent = user.email || "";
    account$("#profile-avatar").textContent =
        (user.name || "L").trim().charAt(0).toUpperCase();
    account$("#new-username").value = user.name || "";
}

async function loadAccount() {
    if (!accountState.token) return;

    try {
        const data = await accountApi("/me");
        renderAccount(data.user);
    } catch {
        localStorage.removeItem("token");
        accountState.token = null;
        account$("#account-view").hidden = true;
        account$("#auth-view").hidden = false;
    }
}

async function submitLogin(event) {
    event.preventDefault();
    showAuthError("login-error");

    const button = account$("#login-submit");
    const formData = new FormData(event.currentTarget);
    button.disabled = true;
    button.textContent = "Signing in...";

    try {
        const data = await accountApi("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: formData.get("email"),
                password: formData.get("password"),
            }),
        });

        if (!data.token) {
            throw new Error("The server did not return a sign-in token.");
        }

        finishSignIn(data.token);
    } catch (error) {
        showAuthError("login-error", error.message || "Could not sign in.");
    } finally {
        button.disabled = false;
        button.textContent = "Sign in";
    }
}

async function submitRegistration(event) {
    event.preventDefault();
    showAuthError("register-error");

    const button = account$("#register-submit");
    const formData = new FormData(event.currentTarget);
    button.disabled = true;
    button.textContent = "Creating account...";

    try {
        await accountApi("/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: formData.get("name"),
                email: formData.get("email"),
                password: formData.get("password"),
            }),
        });

        // Registration endpoint creates the account but does not return a token.
        const loginData = await accountApi("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: formData.get("email"),
                password: formData.get("password"),
            }),
        });

        if (!loginData.token) {
            throw new Error("Account created. Please sign in.");
        }

        finishSignIn(loginData.token);
    } catch (error) {
        showAuthError("register-error", error.message || "Could not create account.");
    } finally {
        button.disabled = false;
        button.textContent = "Create account";
    }
}

async function submitUsername(event) {
    event.preventDefault();
    showAuthError("username-error");
    showAuthSuccess("username-success");

    const button = account$("#username-submit");
    const name = account$("#new-username").value.trim();
    button.disabled = true;
    button.textContent = "Saving...";

    try {
        const data = await accountApi("/me/change/username", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });

        accountState.user = data.user;
        account$("#profile-name").textContent = data.user.name;
        account$("#profile-avatar").textContent =
            data.user.name.trim().charAt(0).toUpperCase();
        showAuthSuccess("username-success", data.message || "Username updated.");
    } catch (error) {
        showAuthError("username-error", error.message || "Could not update username.");
    } finally {
        button.disabled = false;
        button.textContent = "Save username";
    }
}

async function submitPassword(event) {
    event.preventDefault();
    showAuthError("password-error");
    showAuthSuccess("password-success");

    const button = account$("#password-submit");
    const formData = new FormData(event.currentTarget);
    button.disabled = true;
    button.textContent = "Updating...";

    try {
        const data = await accountApi("/me/change/password", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                currentPassword: formData.get("currentPassword"),
                newPassword: formData.get("newPassword"),
            }),
        });

        event.currentTarget.reset();
        showAuthSuccess("password-success", data.message || "Password updated.");
    } catch (error) {
        showAuthError("password-error", error.message || "Could not update password.");
    } finally {
        button.disabled = false;
        button.textContent = "Update password";
    }
}

async function signOutAccount() {
    try {
        await accountApi("/logout", { method: "POST" });
    } catch {
        // Clear this browser's token even if the API is unreachable.
    }

    localStorage.removeItem("token");
    accountState.token = null;
    accountState.user = null;
    location.href = "index.html";
}

async function deleteAccount() {
    const confirmed = confirm(
        "Delete your account and all your service listings? This cannot be undone."
    );
    if (!confirmed) return;

    const button = account$("#delete-account-button");
    button.disabled = true;
    button.textContent = "Deleting...";

    try {
        await accountApi("/me", { method: "DELETE" });
        localStorage.removeItem("token");
        accountState.token = null;
        location.href = "index.html";
    } catch (error) {
        const notice = account$("#account-notice");
        notice.textContent = error.message || "Could not delete the account.";
        notice.hidden = false;
        button.disabled = false;
        button.textContent = "Delete account";
    }
}

function initAccountPage() {
    account$("#show-login-button")?.addEventListener("click", () => switchAuthView("login"));
    account$("#show-register-button")?.addEventListener("click", () => switchAuthView("register"));

    document.addEventListener("click", (event) => {
        const button = event.target.closest("[data-switch-auth]");
        if (button) switchAuthView(button.dataset.switchAuth);
    });

    document.addEventListener("click", (event) => {
        const button = event.target.closest("[data-password-toggle]");
        if (!button) return;

        const input = document.getElementById(button.dataset.passwordToggle);
        if (!input) return;

        const showing = input.type === "password";
        input.type = showing ? "text" : "password";
        button.textContent = showing ? "Hide" : "Show";
        button.setAttribute(
            "aria-label",
            `${showing ? "Hide" : "Show"} password`
        );
    });

    account$("#login-form")?.addEventListener("submit", submitLogin);
    account$("#register-form")?.addEventListener("submit", submitRegistration);
    account$("#username-form")?.addEventListener("submit", submitUsername);
    account$("#password-form")?.addEventListener("submit", submitPassword);
    account$("#account-signout-button")?.addEventListener("click", signOutAccount);
    account$("#delete-account-button")?.addEventListener("click", deleteAccount);

    if (accountState.token) {
        account$("#auth-view").hidden = true;
        loadAccount();
    } else {
        account$("#account-view").hidden = true;
        account$("#auth-view").hidden = false;
        switchAuthView("login");
    }
}

document.addEventListener("DOMContentLoaded", initAccountPage);