// Author: Pyae Phyo Maung ( Luis )
// Student ID: 2535128
// Class: DIT/2B/02


// The left panel displays the packing list, organised by category.
// The right panel displays suggested items that users can add to the list.
// Access rules:
// - Everyone in the trip can see all packing items and mark them as completed.
// - Only the trip owner or the person who added the item can update or remove it.

(() => {
  "use strict";

  // ==========================================
  // 1. CONFIGURATION AND HELPERS
  // ==========================================

  const TOKEN_KEYS = ["orbit_token", "token", "authToken"];

  // Must match the packing_category enum in database/schema.sql
  const CATEGORIES = [
    "Documents",
    "Clothing",
    "Electronics",
    "Toiletries",
    "Others",
  ];

  const $ = (selector) => document.querySelector(selector);

  // Retrieve JWT authentication token
  const getToken = () => {
    for (const key of TOKEN_KEYS) {
      const token =
        localStorage.getItem(key) ||
        sessionStorage.getItem(key);

      if (token) return token;
    }

    return "";
  };

  // Store frontend data
  const state = {
    trip: null,
    members: [],
    items: [],
    isOwner: false,
    userId: null,
    filter: "all",
    suggestions: [],
    weather: [],
    weatherNote: "",
    isPreview: false,
    addingTo: null, // which category has its inline add form open
  };

  let tripId = null;

  // ==========================================
  // 2. DATE HELPERS
  // ==========================================

  const fmt = (date) =>
    new Date(date + "T12:00:00").toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });

  // ==========================================
  // 3. API REQUEST HELPER
  // ==========================================

  async function api(path, options = {}) {
    const token = getToken();

    // No token found
    if (!token) {
      window.location.replace("/login.html");
      throw Error("Please log in to continue.");
    }

    const response = await fetch(path, {
      ...options,

      headers: {
        Authorization: `Bearer ${token}`,

        ...(options.body ? { "Content-Type": "application/json" } : {}),

        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));

    // Token missing, expired or invalid
    if (response.status === 401) {
      for (const key of TOKEN_KEYS) {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      }

      window.location.replace("/login.html");

      throw Error("Your session has expired. Please log in again.");
    }

    if (!response.ok) {
      const error = Error(
        data.error || `Request failed (${response.status}).`
      );
      error.status = response.status;
      throw error;
    }

    return data;
  }

  // ==========================================
  // 4. NOTIFICATIONS
  // ==========================================

  function toast(message) {
    const node = $("#toast");

    node.textContent = message;
    node.classList.remove("hidden");

    clearTimeout(toast.timer);

    toast.timer = setTimeout(
      () => node.classList.add("hidden"),
      3500,
    );
  }

  function showAlert(message) {
    const node = $("#packAlert");
    node.textContent = message;
    node.classList.remove("hidden");
  }

  const hideAlert = () => $("#packAlert").classList.add("hidden");

  // ==========================================
  // 5. RENDER TRIP HEADER
  // ==========================================

  function renderHeader() {
    if (!state.trip) return;

    const t = state.trip;

    $("#tripTitle").textContent = t.title;
    document.title = "Orbit | " + t.title;

    const parts = [t.destination];

    if (t.start_date && t.end_date) {
      parts.push(`${fmt(t.start_date)} – ${fmt(t.end_date)}`);
    }

    parts.push(`${t.traveler_count ?? 1} travellers`);

    $("#tripSubtitle").textContent = parts.join(" · ");
  }

  function renderAvatars() {
    const box = $("#memberAvatars");
    box.replaceChildren();

    for (const member of state.members.slice(0, 4)) {
      const initials = String(member.name || "?")
        .split(/\s+/)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();

      const span = document.createElement("span");
      span.className = "avatar";
      span.title = member.name || "";
      span.textContent = initials;
      box.append(span);
    }
  }

  // ==========================================
  // 6. RENDER PACKING LIST
  // ==========================================

  // The server's rule, repeated here only to decide what to draw.
  const canManage = (item) =>
    state.isOwner ||
    (item.created_by !== null && item.created_by === state.userId);

  const visible = (item) =>
    state.filter === "all" ||
    (state.filter === "packed" ? item.is_checked : !item.is_checked);

  function buildItemRow(item) {
    const row = document.createElement("div");
    row.className = "check-row pk-item";
    row.dataset.itemId = item.item_id;

    const label = document.createElement("label");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.is_checked;
    checkbox.addEventListener("change", () =>
      toggleItem(row, item, checkbox),
    );

    const name = document.createElement("span");
    name.className = "pk-item-name";
    // textContent, never innerHTML: an item name is whatever a member typed
    name.textContent = item.item_name;

    label.append(checkbox, name);

    const right = document.createElement("div");
    right.className = "pk-item-right";

    // Marks the items that came from a smart suggestion
    if (item.from_suggestion) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "AI";
      right.append(tag);
    }

    if (canManage(item)) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "pk-del";
      del.textContent = "Delete";
      del.setAttribute("aria-label", `Delete ${item.item_name}`);
      del.addEventListener("click", () => deleteItem(row, item));
      right.append(del);
    }

    row.append(label, right);
    return row;
  }

  function buildCategoryPanel(category, items) {
    const panel = document.createElement("section");
    panel.className = "feature-panel category-group";

    const head = document.createElement("div");
    head.className = "pk-cat-head";

    const title = document.createElement("h2");
    title.textContent = category;

    const count = document.createElement("span");
    count.className = "pk-count";
    const packedHere = items.filter((i) => i.is_checked).length;
    count.textContent = `${packedHere} of ${items.length}`;

    head.append(title, count);
    panel.append(head);

    const shown = items.filter(visible);

    if (shown.length === 0) {
      const none = document.createElement("p");
      none.className = "pk-count";
      none.style.margin = "10px 0 0";
      none.textContent =
        items.length === 0 ? "Nothing here yet." : "Nothing matches this filter.";
      panel.append(none);
    } else {
      for (const item of shown) panel.append(buildItemRow(item));
    }

    // Inline "+ Add item", one per category
    if (state.addingTo === category) {
      panel.append(buildAddForm(category));
    } else {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "dashed pk-add-btn";
      addBtn.textContent = "+ Add item";
      addBtn.addEventListener("click", () => {
        state.addingTo = category;
        render();
        const input = $(`#packGrid input[data-add="${category}"]`);
        if (input) input.focus();
      });
      panel.append(addBtn);
    }

    return panel;
  }

  function buildAddForm(category) {
    const form = document.createElement("form");
    form.className = "pk-add-form";

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 255;
    input.placeholder = `Add to ${category}`;
    input.dataset.add = category;
    input.setAttribute("aria-label", `New item in ${category}`);

    const save = document.createElement("button");
    save.type = "submit";
    save.className = "btn btn-dark";
    save.textContent = "Add";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => {
      state.addingTo = null;
      render();
    });

    form.append(input, save, cancel);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const itemName = input.value.trim();

      if (itemName === "") {
        input.focus();
        toast("Enter an item name.");
        return;
      }

      save.disabled = true;

      try {
        await addItem(itemName, category);
        input.value = "";
        await load();
        const again = $(`#packGrid input[data-add="${category}"]`);
        if (again) again.focus();
      } catch (error) {
        toast(error.message);
      } finally {
        save.disabled = false;
      }
    });

    return form;
  }

  function renderCount() {
    const total = state.items.length;
    const packed = state.items.filter((i) => i.is_checked).length;
    const percent = total === 0 ? 0 : Math.round((packed / total) * 100);

    $("#packedCount").textContent = `${packed} of ${total} packed`;
    $("#packedBarFill").style.width = `${percent}%`;
    $("#packedBar").setAttribute("aria-valuenow", String(percent));
  }

  function render() {
    const grid = $("#packGrid");
    grid.replaceChildren();

    renderCount();

    // All five categories are always on screen, each with its own
    // "+ Add item", so every kind of item has a place waiting for it
    // whether the list has one yet or not.
    for (const category of CATEGORIES) {
      const items = state.items.filter((i) => i.category === category);
      grid.append(buildCategoryPanel(category, items));
    }
  }

  // ==========================================
  // 7. PACKING LIST SERVER CALLS
  // ==========================================

  const endpoint = (suffix) => `/api/trips/${tripId}${suffix}`;

  async function load() {
    try {
      const data = await api(endpoint("/packing"));

      state.items = data.items || [];
      state.isOwner = Boolean(data.is_owner);

      hideAlert();
      render();
    } catch (error) {
      state.items = [];
      render();

      showAlert(
        error.status === 404
          ? "This trip does not exist, or you do not have access to it."
          : error.message,
      );
    } finally {
      $("#packLoading").classList.add("hidden");
    }
  }

  function addItem(itemName, category) {
    return api(endpoint("/packing"), {
      method: "POST",
      body: JSON.stringify({ item_name: itemName, category }),
    });
  }

  async function toggleItem(row, item, checkbox) {
    const wanted = checkbox.checked;
    row.classList.add("is-busy");

    try {
      await api(`/api/packing/${item.item_id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_checked: wanted }),
      });

      item.is_checked = wanted;
      hideAlert();
      render();
    } catch (error) {
      checkbox.checked = !wanted; // put the tick back the way it was
      row.classList.remove("is-busy");
      toast(error.message);
    }
  }

  async function deleteItem(row, item) {
    row.classList.add("is-busy");

    try {
      await api(`/api/packing/${item.item_id}`, { method: "DELETE" });

      toast(`Removed “${item.item_name}”.`);
      await load();
    } catch (error) {
      row.classList.remove("is-busy");

      toast(
        error.status === 404
          ? "That item has already been removed."
          : error.message,
      );
    }
  }

  // ==========================================
  // 8. SMART PACKING SUGGESTIONS
  // ==========================================
  //
  // The weather + AI endpoint is Sprint 3 work and does not exist yet.
  // Until it does, the panel shows a clearly-marked PREVIEW built from the
  // trip's destination, so the layout and the "add to list" flow can be
  // reviewed. The moment GET /api/trips/:tripId/packing/suggestions exists,
  // this falls through to the real data with no other change.

  function previewSuggestions() {
    const destination = state.trip?.destination || "your destination";

    return {
      preview: true,
      note: `Sample values for ${destination}. The real build uses a forecast or seasonal averages and refreshes closer to departure.`,
      weather: [
        { label: "Mon 14", temp: "4–9°C", summary: "Rain" },
        { label: "Tue 15", temp: "3–8°C", summary: "Cloudy" },
        { label: "Wed 16", temp: "2–7°C", summary: "Rain" },
        { label: "Thu 17", temp: "3–8°C", summary: "Dry" },
        { label: "Fri 18", temp: "4–9°C", summary: "Showers" },
      ],
      items: [
        { item_name: "Waterproof jacket", category: "Clothing", reason: "Rain expected on 3 of 5 days" },
        { item_name: "Thermal base layers", category: "Clothing", reason: "Lows near 2°C" },
        { item_name: "Compact umbrella", category: "Clothing", reason: "Showery spells, lots of walking planned" },
        { item_name: "EU plug adapter (Type C/E)", category: "Electronics", reason: "France uses Type C/E sockets at 230V" },
        { item_name: "Moisturiser and lip balm", category: "Toiletries", reason: "Cold, dry air in winter" },
      ],
    };
  }

  async function loadSuggestions() {
    let data;

    try {
      data = await api(endpoint("/packing/suggestions"));
      state.isPreview = false;
    } catch {
      // Endpoint not built yet (or unreachable): show the labelled preview
      data = previewSuggestions();
      state.isPreview = true;
    }

    state.suggestions = data.items || [];
    state.weather = data.weather || [];
    state.weatherNote = data.note || "";

    renderSuggestions();
    showBanner();
  }

  function renderSuggestions() {
    $("#suggPreviewBadge").hidden = !state.isPreview;

    const destination = state.trip?.destination || "this trip";

    $("#suggContextTitle").textContent = state.isPreview
      ? `Smart list preview for ${destination}`
      : `Smart list for ${destination}`;

    $("#suggContextBody").textContent = state.weatherNote;

    // Weather strip
    const weatherBox = $("#suggWeather");
    weatherBox.replaceChildren();

    for (const day of state.weather) {
      const cell = document.createElement("div");

      const label = document.createElement("b");
      label.textContent = day.label;

      const temp = document.createElement("div");
      temp.textContent = day.temp;

      const summary = document.createElement("span");
      summary.textContent = day.summary;

      cell.append(label, temp, summary);
      weatherBox.append(cell);
    }

    // Suggested items
    const list = $("#suggList");
    list.replaceChildren();

    if (state.suggestions.length === 0) {
      const done = document.createElement("p");
      done.className = "disclaimer";
      done.textContent =
        "No suggestions right now. Everything suggested is already on your list.";
      list.append(done);
      return;
    }

    for (const suggestion of state.suggestions) {
      list.append(buildSuggestionCard(suggestion));
    }
  }

  function buildSuggestionCard(suggestion) {
    const card = document.createElement("div");
    card.className = "suggestion-card";

    const row = document.createElement("div");
    row.className = "pk-sugg";

    const top = document.createElement("div");
    top.className = "suggestion-top";

    const name = document.createElement("h3");
    name.textContent = suggestion.item_name;

    const why = document.createElement("p");
    why.textContent = suggestion.reason || "";

    top.append(name, why);

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "pk-sugg-dismiss";
    dismiss.textContent = "×";
    dismiss.setAttribute("aria-label", `Dismiss ${suggestion.item_name}`);
    dismiss.addEventListener("click", () => {
      state.suggestions = state.suggestions.filter((s) => s !== suggestion);
      renderSuggestions();
    });

    row.append(top, dismiss);

    const actions = document.createElement("div");
    actions.className = "suggestion-actions";

    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn btn-purple";
    add.textContent = "Add to list";

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = suggestion.category;

    add.addEventListener("click", async () => {
      add.disabled = true;

      try {
        await addItem(suggestion.item_name, suggestion.category);

        card.classList.add("is-added");
        add.textContent = "Added";

        state.suggestions = state.suggestions.filter((s) => s !== suggestion);

        showBanner();
        await load();
        renderSuggestions();
        toast(`Added “${suggestion.item_name}”.`);
      } catch (error) {
        add.disabled = false;
        toast(error.message);
      }
    });

    actions.append(add, tag);
    card.append(row, actions);

    return card;
  }

  function showBanner() {
    const banner = $("#packBanner");
    banner.classList.remove("hidden");

    $("#packBannerTitle").textContent = state.isPreview
      ? `Smart list preview for ${state.trip?.destination || "this trip"}`
      : `Smart list for ${state.trip?.destination || "this trip"}`;

    $("#packBannerBody").textContent = state.weatherNote;
  }

  // ==========================================
  // 9. EVENTS
  // ==========================================

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    const d = button.dataset;

    // Navigation tabs
    if (d.tab) {
      if (d.tab === "packing") return;

      if (d.tab === "itinerary") {
        window.location.href = `/itinerary.html?tripId=${tripId}`;
        return;
      }

      if (d.tab === "documents") {
        window.location.href = `/document-locker.html?tripId=${tripId}`;
        return;
      }


      toast(d.tab + " is not implemented yet.");
      return;
    }

    // All / To pack / Packed
    if (d.filter) {
      state.filter = d.filter;

      document
        .querySelectorAll("#packFilter [data-filter]")
        .forEach((b) => b.classList.toggle("active", b === button));

      render();
    }
  });

  $("#suggRegen").addEventListener("click", loadSuggestions);
  $("#packBannerRegen").addEventListener("click", loadSuggestions);

  $("#inviteBtn").addEventListener("click", () =>
    toast("Invite is handled on the Itinerary tab."),
  );

  // ==========================================
  // 10. START
  // ==========================================

  async function init() {
    try {
      // Redirect users without a token to Login
      if (!getToken()) {
        window.location.replace("/login.html");
        return;
      }

      // Retrieve logged-in user
      const me = await api("/api/auth/me");

      state.userId = me.user.id;
      $("#currentUserId").value = me.user.id;


      // ======================================
      // VALIDATE TRIP ID FROM URL
      // ======================================

      const queryId = new URLSearchParams(window.location.search).get("tripId");

      const tripIdNumber = Number(queryId);

      if (
        !queryId ||
        !/^[1-9]\d*$/.test(queryId) ||
        !Number.isSafeInteger(tripIdNumber)
      ) {
        alert("Invalid trip selected. Redirecting to Home.");
        window.location.replace("/home.html");
        return;
      }

      // ======================================
      // LOAD THE TRIP (this is also the access check:
      // requireTripAccess answers 403/404 for outsiders)
      // ======================================

      tripId = tripIdNumber;

      let detail;

      try {
        detail = await api(`/api/trips/${tripIdNumber}`);
      } catch (error) {
        if (error.status === 403 || error.status === 404) {
          alert("Trip not found or you do not have access.");
          window.location.replace("/home.html");
          return;
        }
        throw error;
      }

      state.trip = detail.trip;
      state.members = detail.members || [];

      renderHeader();
      renderAvatars();

      await load();
      await loadSuggestions();
    } catch (error) {
      $("#packLoading").classList.add("hidden");
      showAlert(error.message || "Could not load this page.");
    }
  }

  init();
})();