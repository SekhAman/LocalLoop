const API_BASE = "https://localloop-backend-urem.onrender.com";

const SERVICE_CATEGORIES = [
    "Home Services",
    "Cleaning",
    "Repairs & Maintenance",
    "Beauty & Wellness",
    "Education & Tutoring",
    "Technology",
    "Events",
    "Transportation",
    "Pet Care",
    "Professional Services",
];

const PLACEHOLDER_IMAGE =
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
            <rect width="640" height="360" fill="#E9EFE8"/>
            <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
                font-family="Arial,sans-serif" font-size="76" fill="#245C49">✳</text>
        </svg>
    `);

const state = {
    token: localStorage.getItem("token"),
    user: null,
    page: 1,
    limit: 9,
    search: "",
    location: "",
    category: "",
    totalPages: 1,
    currentService: null,
    selectedFile: null,
    favorites: new Set(),
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function authHeaders(json = false) {
    const headers = {};
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    if (json) headers["Content-Type"] = "application/json";
    return headers;
}

async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            ...authHeaders(options.body && !(options.body instanceof FormData)),
            ...options.headers,
        },
    });

    let data = {};
    try {
        data = await response.json();
    } catch {
        // Some responses may have an empty body.
    }

    if (!response.ok) {
        const error = new Error(data.message || `Request failed (${response.status})`);
        error.status = response.status;
        throw error;
    }

    return data;
}

function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    })[character]);
}

function formatPrice(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Price not listed";

    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
    }).format(amount);
}

function serviceId(service) {
    return service?._id || service?.id || "";
}

function ownerId(service) {
    const owner = service?.owner;
    return typeof owner === "object" ? owner?._id || owner?.id : owner;
}

function setStatus(element, message = "", isError = false) {
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
    element.classList.toggle("is-error", Boolean(message) && isError);
}

function setToast(message) {
    const toast = $("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(setToast.timer);
    setToast.timer = setTimeout(() => {
        toast.hidden = true;
    }, 3000);
}

function updateAuthNavigation() {
    $$("[data-auth-only]").forEach((element) => {
        element.hidden = !state.token;
    });
    $$("[data-signed-out]").forEach((element) => {
        element.hidden = Boolean(state.token);
    });
}

function accountUrl() {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return `account.html?returnTo=${encodeURIComponent(returnTo)}`;
}

function requireLogin() {
    location.href = accountUrl();
}

async function loadCurrentUser() {
    if (!state.token) {
        state.user = null;
        updateAuthNavigation();
        return;
    }

    try {
        const data = await api("/me");
        state.user = data.user;
        updateAuthNavigation();
        await loadFavoriteIds();
    } catch {
        localStorage.removeItem("token");
        state.token = null;
        state.user = null;
        updateAuthNavigation();
    }
}

async function loadFavoriteIds() {
    if (!state.token) {
        state.favorites.clear();
        return;
    }

    try {
        const data = await api("/me/favorites");
        state.favorites = new Set(
            (data.favorites || []).map((item) => serviceId(item))
        );
    } catch (error) {
        if (error.status === 401) {
            localStorage.removeItem("token");
            state.token = null;
            state.user = null;
            updateAuthNavigation();
        }
    }
}

function getSearchParams(page = 1) {
    const params = new URLSearchParams({
        page: String(page),
        limit: String(state.limit),
    });

    if (state.search) params.set("search", state.search);
    if (state.location) params.set("location", state.location);
    if (state.category) params.set("category", state.category);

    return params;
}

function categoryMarkup() {
    const categories = ["All services", ...SERVICE_CATEGORIES];
    return categories.map((category) => {
        const active = category === "All services"
            ? !state.category
            : state.category === category;
        const value = category === "All services" ? "" : category;

        return `
            <button
                class="category-chip${active ? " is-active" : ""}"
                type="button"
                data-category="${escapeHtml(value)}"
                aria-pressed="${active}"
            >${escapeHtml(category)}</button>
        `;
    }).join("");
}

function renderCategories() {
    const list = $("#category-list");
    if (list) list.innerHTML = categoryMarkup();

    const select = $("#listing-category");
    if (select) {
        select.innerHTML = `<option value="">Choose a category</option>` +
            SERVICE_CATEGORIES.map((category) =>
                `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
            ).join("");
    }
}

function cardMarkup(service, { showFavorite = true, showRemove = false } = {}) {
    const id = serviceId(service);
    const owner = service.owner && typeof service.owner === "object" ? service.owner : {};
    const isFavorite = state.favorites.has(id);
    const image = service.image || "";
    const title = escapeHtml(service.name || "Service");
    const category = escapeHtml(service.category || "");
    const locationText = escapeHtml(service.location || "");
    const provider = escapeHtml(owner.name || "Local provider");

    return `
        <article class="service-card">
            <button class="service-card-image" type="button" data-open-service="${escapeHtml(id)}"
                aria-label="View ${title}">
                ${image
            ? `<img src="${escapeHtml(image)}" alt="${title}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">`
            : `<span class="image-placeholder" aria-hidden="true">✳</span>`}
            </button>
            <div class="service-card-body">
                <div class="card-meta">
                    <span class="category-label">${category}</span>
                    <span aria-hidden="true">·</span>
                    <span>${locationText}</span>
                </div>
                <button class="service-card-title" type="button" data-open-service="${escapeHtml(id)}">
                    ${title}
                </button>
                <p class="card-provider">Provided by ${provider}</p>
                <div class="card-bottom">
                    <span class="price">${formatPrice(service.price)}</span>
                    <div class="card-actions">
                        <button class="text-button" type="button" data-open-service="${escapeHtml(id)}">
                            View details
                        </button>
                        ${showFavorite && state.token ? `
                            <button
                                class="favorite-button${isFavorite ? " is-favorite" : ""}"
                                type="button"
                                data-toggle-favorite="${escapeHtml(id)}"
                                aria-label="${isFavorite ? "Remove from" : "Add to"} favorites"
                                aria-pressed="${isFavorite}"
                            >${isFavorite ? "♥" : "♡"}</button>
                        ` : ""}
                        ${showRemove ? `
                            <button class="danger-button" type="button" data-remove-favorite="${escapeHtml(id)}">
                                Remove
                            </button>
                        ` : ""}
                    </div>
                </div>
            </div>
        </article>
    `;
}

function showPage(view) {
    const home = $("#home-view");
    const categories = $("#categories-section");
    const listings = $("#listing-section");

    const isBrowse = view === "home" || view === "search";

    if (home) home.hidden = !isBrowse;
    if (categories) categories.hidden = !isBrowse || view === "search";
    if (listings) listings.hidden = !isBrowse;

    $$("[data-page-view]").forEach((section) => {
        section.hidden = section.dataset.pageView !== view;
    });

    if (view === "home" || view === "search") {
        $("#listing-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    $$(".primary-navigation").forEach((nav) => nav.classList.remove("is-open"));
    $("#mobile-menu-button")?.setAttribute("aria-expanded", "false");
}

async function loadServices() {
    const grid = $("#listing-grid");
    const status = $("#listing-status");
    const empty = $("#listing-empty-state");
    if (!grid) return;

    setStatus(status, "Loading services...");
    empty.hidden = true;
    grid.innerHTML = "";

    try {
        const params = getSearchParams(state.page);
        const data = await api(`/services?${params}`);
        const services = data.services || [];
        state.totalPages = Math.max(1, Number(data.pagination?.pages) || 1);

        grid.innerHTML = services.map((service) => cardMarkup(service)).join("");
        setStatus(status);

        $("#listing-section-title").textContent =
            state.search || state.location || state.category ? "Search results" : "Recently added";

        const summary = $("#results-summary");
        if (summary) {
            summary.textContent = state.search || state.location || state.category
                ? `${data.pagination?.total ?? services.length} services found`
                : "The latest services from your community.";
        }

        const hasSearch = Boolean(state.search || state.location || state.category);
        $("#results-eyebrow").textContent = hasSearch
            ? "Find your local match"
            : "Fresh from your community";
        $("#clear-search-button").hidden = !hasSearch;

        empty.hidden = services.length > 0;
        renderPagination(data.pagination);
        showPage(hasSearch ? "search" : "home");
    } catch (error) {
        setStatus(status, error.message || "Could not load services.", true);
    }
}

function renderPagination(pagination = {}) {
    const container = $("#pagination");
    if (!container) return;

    const pages = Math.max(1, Number(pagination.pages) || 1);
    const current = Math.max(1, Number(pagination.page) || state.page);
    state.totalPages = pages;

    if (pages <= 1) {
        container.innerHTML = "";
        return;
    }

    let html = "";
    if (current > 1) {
        html += `<button type="button" data-page="${current - 1}" aria-label="Previous page">‹</button>`;
    }

    for (let page = 1; page <= pages; page += 1) {
        html += `<button type="button" data-page="${page}" ${page === current ? 'aria-current="page"' : ""}>${page}</button>`;
    }

    if (current < pages) {
        html += `<button type="button" data-page="${current + 1}" aria-label="Next page">›</button>`;
    }

    container.innerHTML = html;
}

async function searchServices() {
    state.search = $("#hero-keyword")?.value.trim() || $("#header-keyword")?.value.trim() || "";
    state.location = $("#hero-location")?.value.trim() || $("#header-location")?.value.trim() || "";
    state.category = "";
    state.page = 1;
    renderCategories();
    await loadServices();
}

function syncSearchInputs() {
    ["#hero-keyword", "#header-keyword"].forEach((selector) => {
        const element = $(selector);
        if (element) element.value = state.search;
    });
    ["#hero-location", "#header-location"].forEach((selector) => {
        const element = $(selector);
        if (element) element.value = state.location;
    });
}

async function openService(id) {
    if (!id) return;

    try {
        const data = await api(`/services/${encodeURIComponent(id)}`);
        state.currentService = data.service;
        renderDetails(data.service);
        location.hash = `service/${encodeURIComponent(id)}`;
        showPage("details");
    } catch (error) {
        setToast(error.message || "Could not load that service.");
    }
}

function renderDetails(service) {
    const container = $("#details-content");
    if (!container) return;

    const id = serviceId(service);
    const owner = service.owner && typeof service.owner === "object" ? service.owner : {};
    const isOwner = Boolean(state.user && ownerId(service) === state.user.id);
    const isFavorite = state.favorites.has(id);

    container.innerHTML = `
        <div class="details-layout">
            <div class="details-photo">
                ${service.image
            ? `<img src="${escapeHtml(service.image)}" alt="${escapeHtml(service.name)}" onerror="this.src='${PLACEHOLDER_IMAGE}'">`
            : `<span class="image-placeholder" aria-hidden="true">✳</span>`}
            </div>
            <div class="details-copy">
                <p class="eyebrow">${escapeHtml(service.category || "Service")} · ${escapeHtml(service.location || "")}</p>
                <h1>${escapeHtml(service.name || "Service")}</h1>
                <div class="details-summary">
                    <strong class="price">${formatPrice(service.price)}</strong>
                    <span>${escapeHtml(service.location || "")}</span>
                </div>
                <div class="details-description">
                    <h2>Description</h2>
                    <p>${escapeHtml(service.description || "")}</p>
                </div>
                <div class="provider-panel">
                    <h2>Provider</h2>
                    <p>${escapeHtml(owner.name || "Local provider")}</p>
                    ${owner.publicContactEmail
            ? `<p>Email: <a href="mailto:${escapeHtml(owner.publicContactEmail)}">${escapeHtml(owner.publicContactEmail)}</a></p>`
            : ""}
                    ${service.contactPhone
            ? `<p>Phone: <a href="tel:${escapeHtml(service.contactPhone)}">${escapeHtml(service.contactPhone)}</a></p>`
            : ""}
                </div>
                <div class="details-actions">
                    ${state.token
            ? `<button class="button button-primary" type="button" data-toggle-favorite="${escapeHtml(id)}">
                            ${isFavorite ? "♥ Saved to favorites" : "♡ Save to favorites"}
                            </button>`
            : `<a class="button button-primary" href="${escapeHtml(accountUrl())}">Sign in to save</a>`}
                    ${isOwner ? `
                        <button class="button button-outline" type="button" data-edit-service="${escapeHtml(id)}">Edit listing</button>
                        <button class="danger-button" type="button" data-delete-service="${escapeHtml(id)}">Delete listing</button>
                    ` : ""}
                </div>
            </div>
        </div>
    `;
}

async function toggleFavorite(id) {
    if (!state.token) {
        requireLogin();
        return;
    }

    try {
        if (state.favorites.has(id)) {
            await api(`/me/favorites/${encodeURIComponent(id)}`, { method: "DELETE" });
            state.favorites.delete(id);
            setToast("Removed from favorites");
        } else {
            await api(`/me/favorites/${encodeURIComponent(id)}`, { method: "POST" });
            state.favorites.add(id);
            setToast("Added to favorites");
        }

        if (state.currentService && serviceId(state.currentService) === id) {
            renderDetails(state.currentService);
        }
        if (location.hash === "#favorites") await loadFavorites();
        else if (location.hash.startsWith("#service/")) {
            // Refresh favorite button states in cards.
            await loadServices();
            showPage("details");
        } else {
            await loadServices();
        }
    } catch (error) {
        setToast(error.message || "Could not update favorites.");
    }
}

async function loadFavorites() {
    if (!state.token) {
        requireLogin();
        return;
    }

    showPage("favorites");
    const status = $("#favorites-status");
    const grid = $("#favorites-grid");
    const empty = $("#favorites-empty");

    setStatus(status, "Loading favorites...");
    grid.innerHTML = "";
    empty.hidden = true;

    try {
        const data = await api("/me/favorites");
        const favorites = data.favorites || [];
        state.favorites = new Set(favorites.map((service) => serviceId(service)));
        grid.innerHTML = favorites.map((service) =>
            cardMarkup(service, { showFavorite: false, showRemove: true })
        ).join("");
        setStatus(status);
        empty.hidden = favorites.length > 0;
    } catch (error) {
        setStatus(status, error.message || "Could not load favorites.", true);
    }
}

async function loadMyListings() {
    if (!state.token) {
        requireLogin();
        return;
    }

    showPage("my-listings");
    const status = $("#my-listings-status");
    const list = $("#my-listings-list");
    const empty = $("#my-listings-empty");

    setStatus(status, "Loading your listings...");
    list.innerHTML = "";
    empty.hidden = true;

    try {
        // This uses the public list route and filters to the current provider.
        // For accounts with more than 50 services, add GET /me/services to the backend.
        const data = await api("/me/services");
        const myServices = data.services || [];

        list.innerHTML = myServices.map((service) => `
            <article class="provider-list-card">
                <div class="provider-list-photo">
                    ${service.image
                ? `<img src="${escapeHtml(service.image)}" alt="" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">`
                : `<span class="image-placeholder" aria-hidden="true">✳</span>`}
                </div>
                <div class="provider-list-info">
                    <h3>${escapeHtml(service.name)}</h3>
                    <p>${escapeHtml(service.location)} · ${formatPrice(service.price)}</p>
                    <p>${escapeHtml(service.category)}</p>
                </div>
                <div class="provider-list-actions">
                    <button class="text-button" type="button" data-edit-service="${escapeHtml(serviceId(service))}">Edit</button>
                    <button class="danger-button" type="button" data-delete-service="${escapeHtml(serviceId(service))}">Delete</button>
                </div>
            </article>
        `).join("");

        setStatus(status);
        empty.hidden = myServices.length > 0;
    } catch (error) {
        setStatus(status, error.message || "Could not load your listings.", true);
    }
}

function openListingForm(service = null) {
    if (!state.token) {
        requireLogin();
        return;
    }

    const dialog = $("#listing-dialog");
    const form = $("#listing-form");
    const isEdit = Boolean(service);

    form.reset();
    state.selectedFile = null;
    $("#listing-id").value = service ? serviceId(service) : "";
    $("#listing-dialog-title").textContent = isEdit ? "Edit listing" : "Add a service";
    $("#save-listing-button").textContent = isEdit ? "Save changes" : "Save listing";
    $("#listing-form-error").hidden = true;
    $("#image-preview").hidden = true;

    if (service) {
        $("#listing-name").value = service.name || "";
        $("#listing-category").value = service.category || "";
        $("#listing-price").value = service.price ?? "";
        $("#listing-location").value = service.location || "";
        $("#listing-phone").value = service.contactPhone || "";
        $("#listing-description").value = service.description || "";

        if (service.image) {
            $("#current-image-hint").hidden = false;
            $("#image-preview-img").src = service.image;
            $("#image-preview").hidden = false;
            $("#remove-image-button").hidden = true;
        }
    } else {
        $("#current-image-hint").hidden = true;
        $("#remove-image-button").hidden = false;
    }

    dialog.showModal();
}

async function editService(id) {
    try {
        let service = state.currentService && serviceId(state.currentService) === id
            ? state.currentService
            : null;

        if (!service) {
            const data = await api(`/services/${encodeURIComponent(id)}`);
            service = data.service;
        }

        if (ownerId(service) !== state.user?.id) {
            setToast("You can only edit your own listings.");
            return;
        }

        openListingForm(service);
    } catch (error) {
        setToast(error.message || "Could not load the listing.");
    }
}

async function deleteService(id) {
    if (!confirm("Delete this listing? This cannot be undone.")) return;

    try {
        await api(`/services/${encodeURIComponent(id)}`, { method: "DELETE" });
        setToast("Listing deleted");
        if (state.currentService && serviceId(state.currentService) === id) {
            state.currentService = null;
            location.hash = "my-listings";
        }
        await loadMyListings();
    } catch (error) {
        setToast(error.message || "Could not delete the listing.");
    }
}

async function submitListing(event) {
    event.preventDefault();

    const form = $("#listing-form");
    const formData = new FormData(form);
    const id = $("#listing-id").value;
    const method = id ? "PATCH" : "POST";
    const path = id ? `/services/${encodeURIComponent(id)}` : "/services";

    // Don't send the blank file input as a file. On edit, no selected file means
    // the existing image stays unchanged.
    const imageInput = $("#listing-image");
    if (!imageInput.files.length) formData.delete("image");

    const button = $("#save-listing-button");
    const errorElement = $("#listing-form-error");
    button.disabled = true;
    button.textContent = "Saving...";
    errorElement.hidden = true;

    try {
        const data = await api(path, { method, body: formData });
        $("#listing-dialog").close();
        setToast(data.message || "Listing saved");
        state.currentService = data.service || null;
        await loadMyListings();
        if (data.service?._id) {
            renderDetails(data.service);
        }
    } catch (error) {
        errorElement.textContent = error.message || "Could not save the listing.";
        errorElement.hidden = false;
    } finally {
        button.disabled = false;
        button.textContent = id ? "Save changes" : "Save listing";
    }
}

async function removeFavorite(id) {
    try {
        await api(`/me/favorites/${encodeURIComponent(id)}`, { method: "DELETE" });
        state.favorites.delete(id);
        await loadFavorites();
    } catch (error) {
        setStatus($("#favorites-status"), error.message || "Could not remove favorite.", true);
    }
}

async function signOut() {
    try {
        if (state.token) {
            await api("/logout", { method: "POST" });
        }
    } catch {
        // Clear the browser token even if the server cannot be reached.
    }

    localStorage.removeItem("token");
    state.token = null;
    state.user = null;
    state.favorites.clear();
    updateAuthNavigation();
    setToast("You’re signed out");
    await loadServices();
}

function readHash() {
    const hash = decodeURIComponent(location.hash.slice(1));

    if (hash.startsWith("service/")) {
        const id = hash.slice("service/".length);
        if (id) openService(id);
        return;
    }

    if (hash === "favorites") {
        loadFavorites();
        return;
    }

    if (hash === "my-listings") {
        loadMyListings();
        return;
    }

    if (hash === "search") {
        loadServices();
        return;
    }

    state.search = "";
    state.location = "";
    state.category = "";
    state.page = 1;
    syncSearchInputs();
    loadServices();
}

function handleDelegatedClick(event) {
    const target = event.target.closest("button, a");
    if (!target) return;

    if (target.matches("[data-view='home']")) {
        event.preventDefault();
        state.search = "";
        state.location = "";
        state.category = "";
        state.page = 1;
        syncSearchInputs();
        location.hash = "browse";
        loadServices();
        return;
    }

    if (target.matches("[data-view='favorites']")) {
        event.preventDefault();
        location.hash = "favorites";
        loadFavorites();
        return;
    }

    if (target.matches("[data-view='my-listings']")) {
        event.preventDefault();
        location.hash = "my-listings";
        loadMyListings();
        return;
    }

    const openId = target.dataset.openService;
    if (openId) {
        openService(openId);
        return;
    }

    const favoriteId = target.dataset.toggleFavorite;
    if (favoriteId) {
        toggleFavorite(favoriteId);
        return;
    }

    const removeId = target.dataset.removeFavorite;
    if (removeId) {
        removeFavorite(removeId);
        return;
    }

    const editId = target.dataset.editService;
    if (editId) {
        editService(editId);
        return;
    }

    const deleteId = target.dataset.deleteService;
    if (deleteId) {
        deleteService(deleteId);
        return;
    }

    const category = target.dataset.category;
    if (category !== undefined) {
        state.category = category;
        state.search = "";
        state.location = "";
        state.page = 1;
        syncSearchInputs();
        renderCategories();
        loadServices();
        return;
    }

    const page = target.dataset.page;
    if (page) {
        state.page = Number(page);
        loadServices();
        $("#listing-section")?.scrollIntoView({ behavior: "smooth" });
        return;
    }

    if (target.matches("[data-action='create-listing']") || target.id === "add-listing-button") {
        openListingForm();
    }
}

function init() {
    renderCategories();
    updateAuthNavigation();

    $("#hero-search-form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        searchServices();
    });

    $("#header-search-form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        searchServices();
    });

    $("#clear-search-button")?.addEventListener("click", () => {
        state.search = "";
        state.location = "";
        state.category = "";
        state.page = 1;
        syncSearchInputs();
        renderCategories();
        loadServices();
    });

    $("#empty-clear-button")?.addEventListener("click", () => {
        state.search = "";
        state.location = "";
        state.category = "";
        state.page = 1;
        syncSearchInputs();
        renderCategories();
        loadServices();
    });

    $("#signout-button")?.addEventListener("click", signOut);
    $("#listing-form")?.addEventListener("submit", submitListing);
    $("#close-listing-dialog")?.addEventListener("click", () => $("#listing-dialog").close());
    $("#cancel-listing-button")?.addEventListener("click", () => $("#listing-dialog").close());

    $("#listing-image")?.addEventListener("change", (event) => {
        const file = event.target.files[0];
        state.selectedFile = file || null;
        if (!file) {
            $("#image-preview").hidden = true;
            return;
        }

        $("#image-preview-img").src = URL.createObjectURL(file);
        $("#image-preview").hidden = false;
        $("#remove-image-button").hidden = false;
        $("#current-image-hint").hidden = true;
    });

    $("#remove-image-button")?.addEventListener("click", () => {
        $("#listing-image").value = "";
        $("#image-preview").hidden = true;
        state.selectedFile = null;
    });

    $("#mobile-menu-button")?.addEventListener("click", (event) => {
        const button = event.currentTarget;
        const nav = $("#primary-navigation");
        const expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", String(!expanded));
        nav.classList.toggle("is-open", !expanded);
    });

    document.addEventListener("click", handleDelegatedClick);
    window.addEventListener("hashchange", readHash);

    loadCurrentUser().then(readHash);
}

document.addEventListener("DOMContentLoaded", init);