// Controls what happen in itinerary.html and communicates with the backend 
// Jekiel Young

(() => {
  "use strict";

  // ==========================================
  // 1. CONFIGURATION AND HELPERS
  // ==========================================

  const TOKEN_KEYS = ["orbit_token", "token", "authToken"];

  const $ = (selector) => document.querySelector(selector);

  // Prevent HTML injection when displaying user data
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch],
    );

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
    activities: [],
    days: [],
    view: "columns",
    filter: "all",
    selectedDay: null,
    loading: false,
  };

  let tripId = null;

  // ==========================================
  // 2. DATE AND TIME HELPERS
  // ==========================================

  const fmt = (date) =>
    new Date(date + "T12:00:00").toLocaleDateString(
      "en-GB",
      {
        weekday: "short",
        day: "numeric",
        month: "short",
      },
    );

  const dayLabel = (date, index) =>
    `Day ${index + 1} · ${fmt(date)}`;

  const statusClass = (value) =>
    String(value).toLowerCase();

  const toTime = (value) =>
    value?.slice(0, 5) || "";

  const iso = (dt) =>
    [
      dt.getFullYear(),
      String(dt.getMonth() + 1).padStart(2, "0"),
      String(dt.getDate()).padStart(2, "0"),
    ].join("-");

  // Generate the days between start_date and end_date
  const daysBetween = (start, end) => {
    let d = new Date(start + "T12:00:00");

    const limit = new Date(end + "T12:00:00");
    const out = [];

    while (d <= limit && out.length < 367) {
      out.push(iso(d));
      d.setDate(d.getDate() + 1);
    }

    return out;
  };

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

  // Send API request
  const response = await fetch(path, {
    ...options,

    headers: {
      Authorization: `Bearer ${token}`,

      ...(options.body
        ? { "Content-Type": "application/json" }
        : {}),

      ...(options.headers || {})
    }
  });

  const data = await response
    .json()
    .catch(() => ({}));

  // Token missing, expired or invalid
  if (response.status === 401) {

    // Remove stored authentication tokens
    for (const key of TOKEN_KEYS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }

    // Redirect to your actual login page
    window.location.replace("/login.html");

    throw Error(
      "Your session has expired. Please log in again."
    );
  }

  // Other API errors
  if (!response.ok) {
    throw Error(
      data.error ||
      `Request failed (${response.status}).`
    );
  }

  return data;
}


  // Build API endpoint using current trip ID
  const endpoint = (suffix) =>
    `/api/trips/${tripId}${suffix}`;

  // ==========================================
  // 4. ACTIVITY FILTERING
  // ==========================================

  // Retrieve activities belonging to a specific day
  const acts = (date) =>
    state.activities
      .filter((a) => a.activity_date === date)
      .sort(
        (a, b) =>
          a.display_order - b.display_order ||
          a.activity_id - b.activity_id,
      );

  // Filter by Planned, Booked, or Completed
  const matches = (a) =>
    state.filter === "all" ||
    statusClass(a.status) === state.filter;

  // ==========================================
  // 5. LOADING AND NOTIFICATIONS
  // ==========================================

  const busy = (value) => {
    state.loading = value;

    $("#addActivityBtn").disabled = value;
    $("#addDayBtn").disabled = value;
    $("#inviteBtn").disabled = value;
  };

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

  // ==========================================
  // 6. RENDER TRIP HEADER
  // ==========================================

  function renderHeader() {
    if (!state.trip) return;

    const t = state.trip;

    $("#tripTitle").textContent = t.title;

    document.title = "Orbit | " + t.title;

    $("#tripSubtitle").textContent =
      `${t.destination} · ` +
      `${fmt(t.start_date)} – ${fmt(t.end_date)} · ` +
      `${state.days.length} days · ` +
      `${t.traveler_count ?? 1} travelers`;

    // Display member initials
    $("#memberAvatars").innerHTML = state.members
      .slice(0, 4)
      .map((m) => {
        const initials = m.name
          .split(/\s+/)
          .map((s) => s[0])
          .slice(0, 2)
          .join("")
          .toUpperCase();

        return `
          <span class="avatar" title="${esc(m.name)}">
            ${esc(initials)}
          </span>
        `;
      })
      .join("");

    // Only trip owner can invite others
    $("#inviteBtn").hidden =
      Number(t.user_id) !==
      Number($("#currentUserId").value);
  }

  // ==========================================
  // 7. RENDER SIDEBAR
  // ==========================================

  function renderSidebar() {
    const totals = {
      planned: 0,
      booked: 0,
      completed: 0,
    };

    // Count activities by status
    for (const a of state.activities) {
      totals[statusClass(a.status)]++;
    }

    // Display day navigation
    $("#dayLinks").innerHTML = state.days
      .map(
        (date, index) => `
          <button
            class="day-link ${
              date === state.selectedDay ? "active" : ""
            }"
            data-pickday="${date}"
          >
            <strong>${dayLabel(date, index)}</strong>
            <small>${acts(date).length} activities</small>
          </button>
        `,
      )
      .join("");

    // Display status summary
    $("#statusSummary").innerHTML =
      ["planned", "booked", "completed"]
        .map(
          (s) => `
            <div class="status-row">
              <span>
                ${s[0].toUpperCase() + s.slice(1)}
              </span>
              <strong>${totals[s] || 0}</strong>
            </div>
          `,
        )
        .join("") +
      `
        <div class="status-track">
          ${["completed", "booked", "planned"]
            .map(
              (s) => `
                <span
                  class="${s}"
                  style="width:${
                    (100 * (totals[s] || 0)) /
                    Math.max(1, state.activities.length)
                  }%"
                ></span>
              `,
            )
            .join("")}
        </div>
      `;

    $(".count-bubble").textContent =
      String(state.activities.length);

    // Only owner can extend trip
    $("#addDayBtn").hidden =
      Number(state.trip.user_id) !==
      Number($("#currentUserId").value);
  }

  
    function ReadMore() {
      document.querySelectorAll(".activity-notes").forEach((container) => {
        const note = container.querySelector(".note");
        const button = container.querySelector(".read-more-btn");

        // Temporarily measure the note at its full height
        note.classList.remove("collapsed");
        const fullHeight = note.scrollHeight;

        // Measure the note while collapsed
        note.classList.add("collapsed");
        const collapsedHeight = note.getBoundingClientRect().height;

        // Only display Read more if the note exceeds two lines
        if (fullHeight > collapsedHeight + 1) {
          button.hidden = false;
        }
      });
    }


  // ==========================================
  // 8. GENERATE ACTIVITY CARDS
  // ==========================================

  function card(a) {
    return `
      <article class="activity" data-id="${a.activity_id}">

        <div class="activity-head">

          <div class="activity-time">
            ${esc(toTime(a.start_time) || "Any time")}

            ${
              a.end_time
                ? " - " + esc(toTime(a.end_time))
                : ""
            }
          </div>

          <span class="status-pill ${statusClass(a.status)}">
            ${esc(a.status)}
          </span>

        </div>

        <h3>${esc(a.title)}</h3>

        <div class="activity-place">
          <span class="pin">♧</span>
          ${esc(a.location || "Location not set")}
        </div>

            ${
        a.notes
        ? `
          <div class="activity-notes">
            <div class="note collapsed">${esc(a.notes)}</div>

            <button
              type="button"
              class="read-more-btn"
              aria-expanded="false"
              hidden
            >
              Read more
            </button>
          </div>
        `
        : ""
    }

        <div class="activity-actions">

          <button
            class="mini-action"
            data-edit="${a.activity_id}"
          >
            Edit
          </button>

          <button
            class="mini-action"
            data-delete="${a.activity_id}"
          >
            Delete
          </button>

        </div>

      </article>
    `;
  }

  // ==========================================
  // 9. GENERATE DAY COLUMNS
  // ==========================================

  function column(date, index) {
    const activities = acts(date);
    const shown = activities.filter(matches);

    return `
      <section
        class="day-column"
        data-day="${date}"
        id="column-${date}"
      >

        <div class="day-column-header">
          <strong>${dayLabel(date, index)}</strong>
          <small>${activities.length} activities</small>
        </div>

        ${
          shown.map(card).join("") ||
          `<div class="empty-state">
            ${
              state.filter === "all"
                ? "No activities yet"
                : "No matching activities"
            }
          </div>`
        }

        <button
          class="dashed add-inline"
          data-addday="${date}"
        >
          + Add activity to Day ${index + 1}
        </button>

      </section>
    `;
  }

  // ==========================================
  // 10. RENDER ITINERARY VIEW
  // ==========================================

  function renderItinerary() {
    const el = $("#itineraryContent");

    if (!state.trip) {
      el.innerHTML = `
        <div class="empty-state">
          Choose a trip to see your itinerary.
        </div>
      `;
      return;
    }

    // Columns view
    if (state.view === "columns") {
      el.innerHTML = `
      <div class="board">
        ${state.days.map(column).join("")}
      </div>
    `;

    ReadMore();
  return;
    }

    // List view
    if (state.view === "list") {
      el.innerHTML = `
        <div class="list-view">

          ${state.days
            .map(
              (date, index) => `
                <section
                  class="list-section"
                  data-day="${date}"
                >

                  <h2>${dayLabel(date, index)}</h2>

                  ${
                    acts(date)
                      .filter(matches)
                      .map(card)
                      .join("") ||
                    `<p class="text-secondary">
                      No matching activities.
                    </p>`
                  }

                  <button
                    class="dashed add-inline"
                    data-addday="${date}"
                  >
                    + Add activity
                  </button>

                </section>
              `,
            )
            .join("")}

        </div>
      `;

      return;
    }

    // Calendar placeholder
    el.innerHTML = `
      <div class="empty-state">
        Calendar view is not implemented yet.
      </div>
    `;
  }

  function render() {
    renderHeader();
    renderSidebar();
    renderItinerary();
  }

  // ==========================================
  // 11. MODAL FUNCTIONS
  // ==========================================

  function modal(html) {
    $("#modalRoot").innerHTML = `
      <div
        class="orbit-dialog-backdrop"
        id="modalBackdrop"
      >

        <div
          class="orbit-dialog"
          role="dialog"
          aria-modal="true"
        >

          <button
            class="close"
            id="closeModal"
            aria-label="Close"
            type="button"
          >
            x
          </button>

          ${html}

        </div>
      </div>
    `;

    $("#closeModal").onclick = closeModal;

    $("#modalBackdrop").addEventListener(
      "mousedown",
      (e) => {
        if (e.target.id === "modalBackdrop") {
          closeModal();
        }
      },
    );
  }

  function closeModal() {
    $("#modalRoot").innerHTML = "";
  }

  // ==========================================
  // 12. LOAD DATA FROM EXPRESS
  // ==========================================

  async function refresh() {
    // Retrieve trip information and activities
    const [details, activityData] = await Promise.all([
      api(endpoint("")),
      api(endpoint("/activities")),
    ]);

    state.trip = details.trip;
    state.members = details.members;
    state.activities = activityData.activities;

    // Generate day columns from trip dates
    state.days = daysBetween(
      state.trip.start_date,
      state.trip.end_date,
    );

    if (!state.days.includes(state.selectedDay)) {
      state.selectedDay = state.days[0];
    }

    render();
  }

  // ==========================================
  // 13. ADD AND EDIT ACTIVITY
  // ==========================================

  function activityForm(
    date = state.selectedDay,
    edit = null,
  ) {
    if (!state.trip) return;

    modal(`
      <h2>${edit ? "Edit" : "Add"} activity</h2>

      <form id="activityForm">

        <label>
          Activity name
          <input
            name="title"
            maxlength="255"
            required
            value="${esc(edit?.title || "")}"
            placeholder="Activity title"
          >
        </label>

        <label>
          Day
          <select name="activity_date">

            ${state.days
              .map(
                (d, i) => `
                  <option
                    value="${d}"
                    ${
                      (edit?.activity_date || date) === d
                        ? "selected"
                        : ""
                    }
                  >
                    ${dayLabel(d, i)}
                  </option>
                `,
              )
              .join("")}

          </select>
        </label>

        <div class="field-row" style="margin:0">

          <label style="flex:1">
            Start time
            <input
              type="time"
              name="start_time"
              value="${esc(
                toTime(edit?.start_time) || "09:00",
              )}"
            >
          </label>

          <label style="flex:1">
            End time
            <input
              type="time"
              name="end_time"
              value="${esc(
                toTime(edit?.end_time) || "10:00",
              )}"
            >
          </label>

        </div>

        <label>
          Location
          <input
            name="location"
            maxlength="255"
            value="${esc(edit?.location || "")}"
          >
        </label>

        <label>
          Notes
          <textarea
            name="notes"
            maxlength="10000"
          >${esc(edit?.notes || "")}</textarea>
        </label>

        <label>
          Status

          <select name="status">

            ${["Planned", "Booked", "Completed"]
              .map(
                (s) => `
                  <option
                    value="${s}"
                    ${
                      (edit?.status || "Planned") === s
                        ? "selected"
                        : ""
                    }
                  >
                    ${s}
                  </option>
                `,
              )
              .join("")}

          </select>
        </label>

        <div class="modal-actions">

          <button
            type="button"
            id="cancelModal"
            class="btn"
          >
            Cancel
          </button>

          <button
            type="submit"
            class="btn btn-dark"
          >
            ${edit ? "Save changes" : "Add activity"}
          </button>

        </div>

      </form>
    `);

    $("#cancelModal").onclick = closeModal;

    // Form submission
    $("#activityForm").onsubmit = async (e) => {
      e.preventDefault();

      const form = e.currentTarget;

      const button =
        form.querySelector("[type=submit]");

      const payload = Object.fromEntries(
        new FormData(form),
      );

      // Validate time
      if (
        payload.start_time &&
        payload.end_time &&
        payload.end_time < payload.start_time
      ) {
        toast(
          "End time must not be earlier than start time.",
        );
        return;
      }

      button.disabled = true;

      try {
        // POST for new activity
        // PATCH for existing activity
        await api(
          edit
            ? endpoint(
                `/activities/${edit.activity_id}`,
              )
            : endpoint("/activities"),
          {
            method: edit ? "PATCH" : "POST",
            body: JSON.stringify(payload),
          },
        );

        state.selectedDay = payload.activity_date;

        closeModal();

        // Load updated activities
        await refresh();

        toast(
          edit
            ? "Activity updated."
            : "Activity added.",
        );

      } catch (error) {
        toast(error.message);
        button.disabled = false;
      }
    };
  }

  // ==========================================
  // 14. INVITE FRIENDS
  // ==========================================

  function invite() {
    if (!state.trip) return;

    modal(`
      <h2>Invite Friends</h2>

      <p>
        Enter the email address of someone
        who already has an Orbit account.
        They will get access to this trip immediately.
      </p>

      <form id="inviteForm">

        <label>
          Email address
          <input
            required
            type="email"
            name="email"
            maxlength="255"
            placeholder="friend@example.com"
          >
        </label>

        <div class="modal-actions">

          <button
            type="button"
            class="btn"
            id="cancelModal"
          >
            Cancel
          </button>

          <button
            type="submit"
            class="btn btn-dark"
          >
            Add member
          </button>

        </div>

      </form>

      <small class="text-secondary">
        An email invitation will not be sent.
        The new member can open this trip from their account.
      </small>
    `);

    $("#cancelModal").onclick = closeModal;

    $("#inviteForm").onsubmit = async (e) => {
      e.preventDefault();

      const button =
        e.currentTarget.querySelector("[type=submit]");

      const email = new FormData(
        e.currentTarget,
      ).get("email");

      button.disabled = true;

      try {
        // Add member using Express API
        const data = await api(endpoint("/members"), {
          method: "POST",
          body: JSON.stringify({ email }),
        });

        closeModal();

        await refresh();

        toast(data.name + " added to the trip.");

      } catch (error) {
        toast(error.message);
        button.disabled = false;
      }
    };
  }

  // ==========================================
  // 15. EXTEND TRIP BY ONE DAY
  // ==========================================

  async function addDay() {
    if (!confirm("Extend the trip by one day?")) {
      return;
    }

    try {
      busy(true);

      await api(endpoint("/extend-day"), {
        method: "POST",
      });

      await refresh();

      // Select the newly added day
      state.selectedDay =
        state.days[state.days.length - 1];

      render();

      toast("Trip extended by one day.");

    } catch (error) {
      toast(error.message);

    } finally {
      busy(false);
    }
  }

  // ==========================================
  // 16. DELETE ACTIVITY
  // ==========================================

  async function deleteActivity(id) {
    if (!confirm("Delete this activity?")) {
      return;
    }

    try {
      await api(
        endpoint("/activities/" + id),
        {
          method: "DELETE",
        },
      );

      await refresh();

      toast("Activity deleted.");

    } catch (error) {
      toast(error.message);
    }
  }

  // ==========================================
  // 17. BUTTON CLICK EVENTS
  // ==========================================

  document.addEventListener("click", (e) => {
    const button = e.target.closest("button");

    if (!button) return;

    const d = button.dataset;
    
    // Expand or collapse notes
    if (button.classList.contains("read-more-btn")) {
      const container = button.closest(".activity-notes");
      const note = container.querySelector(".note");

      const isCollapsed = note.classList.toggle("collapsed");

      button.textContent = isCollapsed
        ? "Read more"
        : "Read less";

      button.setAttribute(
        "aria-expanded",
        String(!isCollapsed)
      );

      return;
    }

    // Navigation tabs
    if (d.tab) {
      if (d.tab !== "itinerary") {
        toast(d.tab + " is not implemented yet.");
        return;
      }

      document
        .querySelectorAll("[data-tab]")
        .forEach((b) =>
          b.classList.toggle(
            "active",
            b === button,
          ),
        );
    }

    // Columns, List and Calendar
    if (d.view) {
      state.view = d.view;

      document
        .querySelectorAll("[data-view]")
        .forEach((b) =>
          b.classList.toggle(
            "active",
            b === button,
          ),
        );

      renderItinerary();
    }

    // Select day from sidebar
    if (d.pickday) {
      state.selectedDay = d.pickday;

      renderSidebar();

      $("#column-" + d.pickday)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }

    // Add activity to selected day
    if (d.addday) {
      activityForm(d.addday);
    }

    // Edit existing activity
    if (d.edit) {
      const item = state.activities.find(
        (a) =>
          a.activity_id === Number(d.edit),
      );

      if (item) {
        activityForm(item.activity_date, item);
      }
    }

    // Delete activity
    if (d.delete) {
      deleteActivity(Number(d.delete));
    }
  });

  // ==========================================
  // 18. STATUS FILTER
  // ==========================================

  $("#statusFilter").addEventListener(
    "change",
    (e) => {
      state.filter = e.target.value;

      renderItinerary();
    },
  );

  // ==========================================
  // 19. MAIN BUTTON EVENTS
  // ==========================================

  $("#addDayBtn").onclick = addDay;

  $("#addActivityBtn").onclick = () =>
    activityForm();

  $("#inviteBtn").onclick = invite;

  // Close modal using Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
    }
  });

  // ==========================================
  // 20. INITIALIZE ITINERARY PAGE
  // ==========================================

  async function init() {
    const msg = $("#itineraryContent");

    msg.innerHTML = `
      <div class="empty-state">
        Loading your itinerary…
      </div>
    `;

    try {
    // Redirect users without a token to Login
    if (!getToken()) {
      window.location.replace("/login.html");
    return;
  }

      // Retrieve logged-in user
      const me = await api("/api/auth/me");

      $("#currentUserId").value = me.user.id;

      // Retrieve user's available trips
      const { trips } = await api("/api/trips");

      

    // ======================================
    // VALIDATE TRIP ID FROM URL
    // ======================================

    const queryId = new URLSearchParams(
      window.location.search
    ).get("tripId");

    // Check if trip ID is a positive, safe integer
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
    // CHECK IF USER HAS ACCESS TO THE TRIP
    // ======================================

    // 'trips' is retrieved earlier from GET /api/trips
    const selected = trips.find(
      (t) => Number(t.trip_id) === tripIdNumber
    );

    // Trip does not exist or user has no access
    if (!selected) {
      alert("Trip not found or you do not have access.");
      window.location.replace("/home.html");
      return;
    }

  // ======================================
  // LOAD VALID TRIP
  // ======================================

  tripId = selected.trip_id;

  await refresh();

    } catch (error) {
      msg.innerHTML = `
        <div class="empty-state">

          <strong>
            Could not load itinerary.
          </strong>

          <p>${esc(error.message)}</p>

        </div>
      `;

      toast(error.message);
    }
  }

  // Run initialization when script loads
  init();

})();
