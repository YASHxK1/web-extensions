(function () {
  "use strict";

  const STORAGE_KEYS = {
    shortcuts: "shortcuts",
    calendarNotes: "calendarNotes",
    todoItems: "todoItems",
    countdowns: "countdowns"
  };

  const grid = document.getElementById("grid");
  const clock = document.getElementById("clock");
  const date = document.getElementById("date");
  const shortcutTemplate = document.getElementById("shortcut-template");
  const formTemplate = document.getElementById("form-template");
  const calendarTitle = document.getElementById("calendar-title");
  const calendarGrid = document.getElementById("calendar-grid");
  const calendarNoteHost = document.getElementById("calendar-note-host");
  const prevMonthButton = document.getElementById("prev-month");
  const nextMonthButton = document.getElementById("next-month");
  const todoForm = document.getElementById("todo-form");
  const todoInput = document.getElementById("todo-input");
  const todoList = document.getElementById("todo-list");
  const openCountdownDialogButton = document.getElementById("open-countdown-dialog");
  const closeCountdownDialogButton = document.getElementById("close-countdown-dialog");
  const countdownDialog = document.getElementById("countdown-dialog");
  const countdownDialogTitle = document.getElementById("countdown-dialog-title");
  const countdownForm = document.getElementById("countdown-form");
  const countdownLabel = document.getElementById("countdown-label");
  const countdownDate = document.getElementById("countdown-date");
  const countdownSubmit = document.getElementById("countdown-submit");
  const countdownList = document.getElementById("countdown-list");

  let shortcuts = [];
  let calendarNotes = [];
  let todoItems = [];
  let countdowns = [];
  let activeForm = null;
  let pendingDeleteId = null;
  let deleteTimer = null;
  let visibleMonth = startOfMonth(new Date());
  let selectedCalendarDate = null;
  let editingTodoId = null;
  let activeCountdownId = null;

  function updateClock() {
    const now = new Date();
    clock.textContent = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit"
    }).format(now);
    date.textContent = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric"
    }).format(now);
  }

  function storageAvailable() {
    return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  }

  function readState() {
    return new Promise((resolve) => {
      if (!storageAvailable()) {
        resolve({});
        return;
      }

      chrome.storage.local.get({
        [STORAGE_KEYS.shortcuts]: [],
        [STORAGE_KEYS.calendarNotes]: [],
        [STORAGE_KEYS.todoItems]: [],
        [STORAGE_KEYS.countdowns]: []
      }, resolve);
    });
  }

  function writeKey(key, value) {
    return new Promise((resolve) => {
      if (!storageAvailable()) {
        resolve();
        return;
      }

      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }

  function createId(prefix) {
    if (crypto.randomUUID) {
      return crypto.randomUUID();
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeUrl(value) {
    const trimmed = value.trim();
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Use an http or https URL.");
    }

    return url.href;
  }

  function faviconUrl(url) {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.getURL) {
      return "";
    }

    const params = new URLSearchParams({
      pageUrl: url,
      size: "64"
    });

    return chrome.runtime.getURL(`/_favicon/?${params.toString()}`);
  }

  function firstLetter(name) {
    return name.trim().slice(0, 1).toUpperCase() || "?";
  }

  function toDateKey(value) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(value) {
    const parts = value.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function startOfMonth(value) {
    return new Date(value.getFullYear(), value.getMonth(), 1);
  }

  function startOfDay(value) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  function daysBetween(fromDate, toDate) {
    const dayMs = 24 * 60 * 60 * 1000;
    return Math.round((startOfDay(toDate) - startOfDay(fromDate)) / dayMs);
  }

  function closeForm() {
    activeForm = null;
    renderShortcuts();
  }

  function openForm(mode, shortcut) {
    activeForm = {
      mode,
      id: shortcut ? shortcut.id : null,
      name: shortcut ? shortcut.name : "",
      url: shortcut ? shortcut.url : ""
    };
    pendingDeleteId = null;
    renderShortcuts();

    const input = grid.querySelector(".shortcut-form input[name='name']");
    if (input) {
      input.focus();
      input.select();
    }
  }

  async function saveForm(form) {
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const error = form.querySelector(".form-error");
    let url;

    if (!name) {
      error.textContent = "Name is required.";
      return;
    }

    try {
      url = normalizeUrl(String(formData.get("url") || ""));
    } catch (err) {
      error.textContent = err.message || "Enter a valid URL.";
      return;
    }

    if (activeForm.mode === "edit") {
      shortcuts = shortcuts.map((shortcut) => (
        shortcut.id === activeForm.id ? { ...shortcut, name, url } : shortcut
      ));
    } else {
      shortcuts = shortcuts.concat({ id: createId("shortcut"), name, url });
    }

    await writeKey(STORAGE_KEYS.shortcuts, shortcuts);
    closeForm();
  }

  async function deleteShortcut(id) {
    shortcuts = shortcuts.filter((shortcut) => shortcut.id !== id);
    pendingDeleteId = null;
    await writeKey(STORAGE_KEYS.shortcuts, shortcuts);
    renderShortcuts();
  }

  function requestDelete(button, id) {
    if (pendingDeleteId === id) {
      deleteShortcut(id);
      return;
    }

    pendingDeleteId = id;
    button.classList.add("confirming");
    button.textContent = "Confirm";
    button.setAttribute("aria-label", "Confirm delete shortcut");

    clearTimeout(deleteTimer);
    deleteTimer = setTimeout(() => {
      pendingDeleteId = null;
      renderShortcuts();
    }, 3000);
  }

  function renderShortcut(shortcut) {
    const node = shortcutTemplate.content.firstElementChild.cloneNode(true);
    const link = node.querySelector(".shortcut-link");
    const favicon = node.querySelector(".favicon");
    const fallback = node.querySelector(".fallback-icon");
    const name = node.querySelector(".shortcut-name");
    const editButton = node.querySelector(".edit-button");
    const deleteButton = node.querySelector(".delete-button");

    link.href = shortcut.url;
    favicon.src = faviconUrl(shortcut.url);
    fallback.textContent = firstLetter(shortcut.name);
    fallback.hidden = true;
    name.textContent = shortcut.name;

    favicon.addEventListener("error", () => {
      favicon.hidden = true;
      fallback.hidden = false;
    });

    editButton.addEventListener("click", () => openForm("edit", shortcut));
    deleteButton.addEventListener("click", () => requestDelete(deleteButton, shortcut.id));

    if (pendingDeleteId === shortcut.id) {
      deleteButton.classList.add("confirming");
      deleteButton.textContent = "Confirm";
      deleteButton.setAttribute("aria-label", "Confirm delete shortcut");
    }

    return node;
  }

  function renderForm() {
    const form = formTemplate.content.firstElementChild.cloneNode(true);
    const name = form.querySelector("input[name='name']");
    const url = form.querySelector("input[name='url']");
    const cancel = form.querySelector(".cancel-button");

    name.value = activeForm.name;
    url.value = activeForm.url;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveForm(form);
    });
    cancel.addEventListener("click", closeForm);

    return form;
  }

  function renderAddTile() {
    const button = document.createElement("button");
    button.className = "add-tile";
    button.type = "button";
    button.setAttribute("aria-label", "Add shortcut");
    button.innerHTML = '<span class="add-mark" aria-hidden="true">+</span>';
    button.addEventListener("click", () => openForm("add"));
    return button;
  }

  function renderShortcuts() {
    grid.replaceChildren();

    shortcuts.forEach((shortcut) => {
      if (activeForm && activeForm.mode === "edit" && activeForm.id === shortcut.id) {
        grid.append(renderForm());
      } else {
        grid.append(renderShortcut(shortcut));
      }
    });

    if (activeForm && activeForm.mode === "add") {
      grid.append(renderForm());
    } else {
      grid.append(renderAddTile());
    }
  }

  function findCalendarNote(dateKey) {
    return calendarNotes.find((entry) => entry.date === dateKey);
  }

  async function saveCalendarNote(dateKey, note) {
    const cleanNote = note.trim();
    const existing = findCalendarNote(dateKey);

    if (!cleanNote) {
      calendarNotes = calendarNotes.filter((entry) => entry.date !== dateKey);
    } else if (existing) {
      calendarNotes = calendarNotes.map((entry) => (
        entry.date === dateKey ? { date: dateKey, note: cleanNote } : entry
      ));
    } else {
      calendarNotes = calendarNotes.concat({ date: dateKey, note: cleanNote });
    }

    selectedCalendarDate = null;
    await writeKey(STORAGE_KEYS.calendarNotes, calendarNotes);
    renderCalendar();
  }

  function renderCalendarNoteForm(dateKey) {
    const existing = findCalendarNote(dateKey);
    const form = document.createElement("form");
    form.className = "calendar-note-form";

    const label = document.createElement("label");
    const labelText = document.createElement("span");
    const input = document.createElement("input");
    const actions = document.createElement("div");
    const save = document.createElement("button");
    const clear = document.createElement("button");

    labelText.textContent = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric"
    }).format(parseDateKey(dateKey));
    input.type = "text";
    input.name = "note";
    input.maxLength = 80;
    input.autocomplete = "off";
    input.value = existing ? existing.note : "";
    input.placeholder = "Date note";
    save.type = "submit";
    save.className = "small-action";
    save.textContent = "Save";
    clear.type = "button";
    clear.className = "ghost-button";
    clear.textContent = existing ? "Delete" : "Cancel";
    actions.className = "calendar-note-actions";

    label.append(labelText, input);
    actions.append(save, clear);
    form.append(label, actions);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveCalendarNote(dateKey, input.value);
    });
    clear.addEventListener("click", () => {
      if (existing) {
        saveCalendarNote(dateKey, "");
      } else {
        selectedCalendarDate = null;
        renderCalendar();
      }
    });

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });

    return form;
  }

  function renderCalendar() {
    calendarGrid.replaceChildren();
    calendarNoteHost.replaceChildren();

    const todayKey = toDateKey(new Date());
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingBlanks = firstDay.getDay();

    calendarTitle.textContent = new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric"
    }).format(visibleMonth);

    for (let index = 0; index < leadingBlanks; index += 1) {
      const spacer = document.createElement("span");
      spacer.className = "calendar-spacer";
      calendarGrid.append(spacer);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dayDate = new Date(year, month, day);
      const dateKey = toDateKey(dayDate);
      const button = document.createElement("button");
      const number = document.createElement("span");

      button.type = "button";
      button.className = "calendar-day";
      button.setAttribute("aria-label", `Add note for ${dateKey}`);
      number.textContent = String(day);
      button.append(number);

      if (dateKey === todayKey) {
        button.classList.add("today");
      }

      if (findCalendarNote(dateKey)) {
        button.classList.add("has-note");
      }

      if (dateKey === selectedCalendarDate) {
        button.classList.add("selected");
      }

      button.addEventListener("click", () => {
        selectedCalendarDate = dateKey;
        renderCalendar();
      });

      calendarGrid.append(button);
    }

    if (selectedCalendarDate) {
      calendarNoteHost.append(renderCalendarNoteForm(selectedCalendarDate));
    }
  }

  async function addTodo(text) {
    const cleanText = text.trim();
    if (!cleanText) {
      return;
    }

    todoItems = todoItems.concat({
      id: createId("todo"),
      text: cleanText,
      done: false
    });
    await writeKey(STORAGE_KEYS.todoItems, todoItems);
    renderTodos();
  }

  async function toggleTodo(id, done) {
    todoItems = todoItems.map((item) => (
      item.id === id ? { ...item, done } : item
    ));
    await writeKey(STORAGE_KEYS.todoItems, todoItems);
    renderTodos();
  }

  async function deleteTodo(id) {
    todoItems = todoItems.filter((item) => item.id !== id);
    await writeKey(STORAGE_KEYS.todoItems, todoItems);
    renderTodos();
  }

  async function updateTodo(id, text) {
    const cleanText = text.trim();

    editingTodoId = null;
    if (!cleanText) {
      renderTodos();
      return;
    }

    todoItems = todoItems.map((item) => (
      item.id === id ? { ...item, text: cleanText } : item
    ));
    await writeKey(STORAGE_KEYS.todoItems, todoItems);
    renderTodos();
  }

  function cancelTodoEdit() {
    editingTodoId = null;
    renderTodos();
  }

  function startTodoEdit(id) {
    editingTodoId = id;
    renderTodos();

    const input = todoList.querySelector(".todo-edit-input");
    if (input) {
      input.focus();
      input.select();
    }
  }

  function renderTodos() {
    todoList.replaceChildren();

    todoItems.forEach((item) => {
      const row = document.createElement("li");
      const checkLabel = document.createElement("label");
      const checkbox = document.createElement("input");
      const textWrap = document.createElement("span");
      const remove = document.createElement("button");

      row.className = item.done ? "todo-row done" : "todo-row";
      checkbox.type = "checkbox";
      checkbox.checked = item.done;
      checkLabel.className = "todo-check";
      textWrap.className = "todo-text-wrap";
      remove.type = "button";
      remove.className = "icon-button compact-delete";
      remove.setAttribute("aria-label", `Delete task ${item.text}`);
      remove.textContent = "×";

      checkbox.addEventListener("change", () => toggleTodo(item.id, checkbox.checked));
      remove.addEventListener("click", () => deleteTodo(item.id));

      checkLabel.append(checkbox);

      if (editingTodoId === item.id) {
        const editInput = document.createElement("input");
        editInput.className = "todo-edit-input";
        editInput.type = "text";
        editInput.maxLength = 90;
        editInput.value = item.text;
        editInput.setAttribute("aria-label", `Edit task ${item.text}`);

        editInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            updateTodo(item.id, editInput.value);
          }

          if (event.key === "Escape") {
            event.preventDefault();
            cancelTodoEdit();
          }
        });
        editInput.addEventListener("blur", () => {
          if (editingTodoId === item.id) {
            updateTodo(item.id, editInput.value);
          }
        });
        textWrap.append(editInput);
      } else {
        const textButton = document.createElement("button");
        textButton.className = "todo-text-button";
        textButton.type = "button";
        textButton.textContent = item.text;
        textButton.setAttribute("aria-label", `Edit task ${item.text}`);
        textButton.addEventListener("click", () => startTodoEdit(item.id));
        textWrap.append(textButton);
      }

      row.append(checkLabel, textWrap, remove);
      todoList.append(row);
    });
  }

  function countdownPhrase(entry) {
    const diff = daysBetween(new Date(), parseDateKey(entry.date));
    const count = Math.abs(diff);
    const unit = count === 1 ? "day" : "days";

    if (entry.direction === "up") {
      if (diff > 0) {
        return `starts in ${count} ${unit}`;
      }
      if (diff === 0) {
        return "starts today";
      }
      return `${count} ${unit} ago`;
    }

    if (diff > 0) {
      return `in ${count} ${unit}`;
    }
    if (diff === 0) {
      return "today";
    }
    return `${count} ${unit} overdue`;
  }

  async function saveCountdown(form) {
    const formData = new FormData(form);
    const label = String(formData.get("label") || "").trim();
    const targetDate = String(formData.get("date") || "");
    const direction = String(formData.get("direction") || "down");

    if (!label || !targetDate) {
      return;
    }

    const nextEntry = {
      id: activeCountdownId || createId("countdown"),
      label,
      date: targetDate,
      direction: direction === "up" ? "up" : "down"
    };

    if (activeCountdownId) {
      countdowns = countdowns.map((entry) => (
        entry.id === activeCountdownId ? nextEntry : entry
      ));
    } else {
      countdowns = countdowns.concat(nextEntry);
    }

    await writeKey(STORAGE_KEYS.countdowns, countdowns);
    closeCountdownDialog();
    renderCountdowns();
  }

  function openCountdownDialog(entry) {
    activeCountdownId = entry ? entry.id : null;
    countdownDialogTitle.textContent = entry ? "Edit countdown" : "Add countdown";
    countdownSubmit.textContent = entry ? "Save" : "Add";
    countdownLabel.value = entry ? entry.label : "";
    countdownDate.value = entry ? entry.date : "";
    countdownForm.querySelector(`input[name='direction'][value='${entry && entry.direction === "up" ? "up" : "down"}']`).checked = true;
    countdownDialog.hidden = false;

    requestAnimationFrame(() => {
      countdownLabel.focus();
      countdownLabel.select();
    });
  }

  function closeCountdownDialog() {
    activeCountdownId = null;
    countdownForm.reset();
    countdownForm.querySelector("input[name='direction'][value='down']").checked = true;
    countdownDialog.hidden = true;
  }

  async function deleteCountdown(id) {
    countdowns = countdowns.filter((entry) => entry.id !== id);
    await writeKey(STORAGE_KEYS.countdowns, countdowns);
    renderCountdowns();
  }

  function renderCountdowns() {
    countdownList.replaceChildren();

    countdowns.forEach((entry) => {
      const tile = document.createElement("article");
      const label = document.createElement("div");
      const count = document.createElement("div");
      const meta = document.createElement("div");
      const remove = document.createElement("button");

      tile.className = "countdown-tile";
      label.className = "countdown-label";
      count.className = "countdown-count";
      meta.className = "countdown-meta";
      remove.type = "button";
      remove.className = "icon-button compact-delete";
      remove.setAttribute("aria-label", `Delete countdown ${entry.label}`);
      remove.textContent = "×";
      tile.tabIndex = 0;
      tile.setAttribute("role", "button");
      tile.setAttribute("aria-label", `Edit countdown ${entry.label}`);

      label.textContent = entry.label;
      count.textContent = countdownPhrase(entry);
      meta.textContent = new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
      }).format(parseDateKey(entry.date));
      tile.addEventListener("click", () => openCountdownDialog(entry));
      tile.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openCountdownDialog(entry);
        }
      });
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteCountdown(entry.id);
      });

      tile.append(label, count, meta, remove);
      countdownList.append(tile);
    });
  }

  function bindEvents() {
    prevMonthButton.addEventListener("click", () => {
      visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
      selectedCalendarDate = null;
      renderCalendar();
    });

    nextMonthButton.addEventListener("click", () => {
      visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
      selectedCalendarDate = null;
      renderCalendar();
    });

    todoForm.addEventListener("submit", (event) => {
      event.preventDefault();
      addTodo(todoInput.value);
      todoInput.value = "";
      todoInput.focus();
    });

    openCountdownDialogButton.addEventListener("click", () => openCountdownDialog());
    closeCountdownDialogButton.addEventListener("click", closeCountdownDialog);
    countdownDialog.addEventListener("click", (event) => {
      if (event.target === countdownDialog) {
        closeCountdownDialog();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !countdownDialog.hidden) {
        closeCountdownDialog();
      }
    });

    countdownForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveCountdown(countdownForm);
    });
  }

  async function init() {
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(renderCountdowns, 60 * 1000);
    bindEvents();

    const state = await readState();
    shortcuts = Array.isArray(state[STORAGE_KEYS.shortcuts]) ? state[STORAGE_KEYS.shortcuts] : [];
    calendarNotes = Array.isArray(state[STORAGE_KEYS.calendarNotes]) ? state[STORAGE_KEYS.calendarNotes] : [];
    todoItems = Array.isArray(state[STORAGE_KEYS.todoItems]) ? state[STORAGE_KEYS.todoItems] : [];
    countdowns = Array.isArray(state[STORAGE_KEYS.countdowns]) ? state[STORAGE_KEYS.countdowns] : [];

    renderShortcuts();
    renderCalendar();
    renderTodos();
    renderCountdowns();
  }

  init();
})();
