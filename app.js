/* UI and local persistence. All user text is escaped; imported notes never execute HTML. */
"use strict";
const enumLabel = (value) => I18n.t(value);
let locale = I18n.locale;
const C = LibCore,
  $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const icons = {
  books:
    '<path d="M4 4h5v16H4zM9 6h5v14H9zM15 4l4-1 4 16-4 1zM5 8h3M10 10h3"/>',
  book: '<path d="M5 3h13a1 1 0 0 1 1 1v17H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zm0 0v14m-2 1a2 2 0 0 1 2-1h14M9 7h6M9 10h5"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5"/>',
  save: '<path d="M5 3h12l4 4v14H3V3h2zM7 3v6h10V3M7 21v-8h10v8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  filter: '<path d="M4 7h16M7 12h10M10 17h4"/>',
  table:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>',
  note: '<path d="M6 3h9l4 4v14H5V3zm8 0v5h5M8 12h8M8 16h6"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  close: '<path d="M6 6L18 18M6 18L18 6"/>',
  edit: '<path d="m14 5 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 15z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 7h.01"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  right: '<path d="m10 6 6 6-6 6"/>',
  palette:
    '<circle cx="8" cy="9" r="1"/><circle cx="12" cy="6" r="1"/><circle cx="16" cy="9" r="1"/><path d="M12 3a9 9 0 1 0 0 18c4 0 0-5 3-5h3c4 0 4-13-6-13"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  restore: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',
  undo: '<path d="M9 7H5V3"/><path d="M5 7c2.4-2.8 6.1-4.5 10.2-4 4.8.6 8.3 4.6 8.3 9.5 0 5.3-4.3 9.5-9.5 9.5-4 0-7.5-2.5-8.9-6.1"/>',
  redo: '<path d="M15 7h4V3"/><path d="M19 7c-2.4-2.8-6.1-4.5-10.2-4-4.8.6-8.3 4.6-8.3 9.5 0 5.3 4.3 9.5 9.5 9.5 4 0 7.5-2.5 8.9-6.1"/>',
};
function icon(n) {
  return (
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    (icons[n] || icons.book) +
    "</svg>"
  );
}
$$("[data-icon]").forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
let state,
  db,
  volatile = false,
  scope = "all",
  view = "table",
  page = 1,
  selection = null,
  draft = null,
  editing = false,
  dirty = false,
  busy = false,
  opener = null,
  toastTimer;
const undoHistory = [],
  redoHistory = [];
const HISTORY_LIMIT = 30,
  HISTORY_ENTRY_LIMIT = 12 * 1024 * 1024;
let incoming = null,
  contentFilter = "";
const pageSize = 50;
const channel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel("eigrutel-bibliotheque")
    : null;
const active = () => state.books.filter((b) => !b.deletedAt);
const color = (id) =>
  state.palette.find((c) => c.id === id) || { id, name: id, hex: "#b4b6bb" };
const swatches = (ids) =>
  '<span class="swatches">' +
  ids
    .map(
      (id) =>
        '<span class="swatch" style="background:' +
        color(id).hex +
        '" title="' +
        C.esc(color(id).name) +
        '" aria-label="' +
        C.esc(color(id).name) +
        '"></span>',
    )
    .join("") +
  "</span>";
const badges = (themes) =>
  themes
    .map(
      (t) =>
        '<span class="badge ' +
        (t === "Sciences"
          ? "science"
          : ["Beaux-Arts", "Littérature", "Peinture"].includes(t)
            ? "art"
            : "") +
        '">' +
        C.esc(t) +
        "</span>",
    )
    .join("");
const hasNotes = (b) =>
  !!b.notes.replace(/!\[[^\]]*\]\(attachment:[^)]+\)/g, "").trim();
const plural = (n, s, p = s + "s") =>
  n + " " + ((locale.startsWith("en") ? n !== 1 : n > 1) ? p : s);
const stamp = () => new Date().toLocaleDateString("sv-SE");
function librarySlug(value = state?.libraryName) {
  return C.norm(value || "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
function backupBaseName() {
  const slug = librarySlug();
  return "bibliotheque" + (slug ? "_" + slug : "");
}
// Name edits have a small synchronous recovery journal, separate from book data.
// This survives closing a mobile tab before blur or the IndexedDB write completes.
const nameJournalKey = "eigrutel-bibliotheque-name-draft-v1";
let libraryNameWrites = Promise.resolve(),
  pendingLibraryName = null,
  nameSaveTimer;
const commitIdleWaiters = [];
function waitForCommitIdle() {
  return busy
    ? new Promise((resolve) => commitIdleWaiters.push(resolve))
    : Promise.resolve();
}
function rememberNameDraft(value) {
  pendingLibraryName = String(value).trim().slice(0, 80);
  try {
    localStorage.setItem(
      nameJournalKey,
      JSON.stringify({
        name: pendingLibraryName,
        baseName: state?.libraryName || "",
      }),
    );
  } catch {} // IndexedDB remains the primary store when localStorage is unavailable.
}
function clearNameDraft(name) {
  if (pendingLibraryName !== name) return;
  pendingLibraryName = null;
  try {
    const record = JSON.parse(localStorage.getItem(nameJournalKey) || "null");
    if (record?.name === name) localStorage.removeItem(nameJournalKey);
  } catch {}
}
function saveLibraryName(value) {
  clearTimeout(nameSaveTimer);
  const name = String(value).trim().slice(0, 80);
  rememberNameDraft(name);
  const operation = libraryNameWrites
    .catch(() => {})
    .then(async () => {
      await waitForCommitIdle();
      if (state.libraryName !== name)
        await commit(
          { ...state, libraryName: name },
          { setLibraryName: true, history: false },
        );
      clearNameDraft(name);
      if ($("#library-name").value.trim().slice(0, 80) === name)
        $("#library-name").value = name;
      return name;
    });
  libraryNameWrites = operation;
  return operation;
}
async function ensureLibraryNameSaved() {
  return saveLibraryName($("#library-name").value);
}
async function recoverLibraryName() {
  let record;
  try {
    record = JSON.parse(localStorage.getItem(nameJournalKey) || "null");
  } catch {
    return;
  }
  if (
    !record ||
    typeof record.name !== "string" ||
    typeof record.baseName !== "string"
  )
    return;
  // Never override a different name restored by an import or another tab.
  if (
    record.baseName !== (state.libraryName || "") &&
    record.name !== state.libraryName
  ) {
    try {
      localStorage.removeItem(nameJournalKey);
    } catch {}
    return;
  }
  await saveLibraryName(record.name);
}
function syncLibraryName(previous) {
  const input = $("#library-name");
  if (input.value.trim() === (previous?.libraryName || ""))
    input.value = state.libraryName || "";
  $("#app-name").textContent = state.libraryName || "";
  document.title =
    (state.libraryName ? state.libraryName + " · " : "") +
    I18n.t("Bibliothèque");
}

function toast(msg, error = false) {
  $("#toast").textContent = msg;
  $("#toast").classList.toggle("error", error);
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => ($("#toast").hidden = true),
    error ? 10000 : 4500,
  );
}
function fail(e) {
  console.error(e);
  toast(e.message || String(e), true);
}
function modal(title, body, actions = "") {
  const m = $("#modal");
  m.innerHTML =
    '<div class="dialog-head"><h2>' +
    C.esc(title) +
    I18n.html(
      '</h2><button class="icon subtle" data-close-modal aria-label="Fermer">',
    ) +
    icon("close") +
    "</button></div>" +
    body +
    (actions ? '<div class="dialog-actions">' + actions + "</div>" : "");
  if (!m.open) m.showModal();
  m.querySelector("[data-close-modal]").onclick = () => m.close();
  return m;
}
const narrowScreen = matchMedia("(max-width:850px)");
let sidebarCollapsed = false;
function syncSidebar() {
  const visible = narrowScreen.matches
    ? $("#sidebar").classList.contains("open")
    : !sidebarCollapsed;
  document.body.classList.toggle("sidebar-collapsed", sidebarCollapsed);
  $("#sidebar").inert = !visible;
  $("#sidebar").setAttribute("aria-hidden", String(!visible));
  $("#sidebar-backdrop").hidden = !(narrowScreen.matches && visible);
  const label = visible
    ? I18n.t("Masquer le panneau")
    : I18n.t("Afficher le panneau");
  $("#menu-btn").setAttribute("aria-label", label);
  $("#menu-btn").title = label;
  $("#menu-btn").setAttribute("aria-expanded", String(visible));
}
function closeSidebar() {
  $("#sidebar").classList.remove("open");
  syncSidebar();
}
function toggleSidebar() {
  if (narrowScreen.matches) $("#sidebar").classList.toggle("open");
  else {
    sidebarCollapsed = !sidebarCollapsed;
    if (db) {
      const tx = db.transaction("state", "readwrite");
      tx.objectStore("state").put({ sidebarCollapsed }, "ui");
      tx.onerror = () =>
        toast(I18n.t("Le choix du panneau ne pourra pas être mémorisé."), true);
    }
  }
  syncSidebar();
  $("#menu-btn").focus();
}
narrowScreen.addEventListener("change", closeSidebar);
// Persistence: keep the historical database name so existing installations retain their data.
// Transactions check revisions to prevent another tab from silently overwriting edits.
function openDB() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB)
      return reject(Error(I18n.t("Stockage local indisponible.")));
    const req = indexedDB.open("eigrutel-bibliotheque-v1", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("state");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () =>
      reject(Error(I18n.t("Fermez les autres onglets de la bibliothèque.")));
  });
}
function load(key = "main") {
  return new Promise((resolve, reject) => {
    const r = db.transaction("state", "readonly").objectStore("state").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function commit(next, opts = {}) {
  if (busy)
    throw Error(
      I18n.t("Un enregistrement est en cours. Réessayez dans un instant."),
    );
  busy = true;
  const expected = state?.revision || 0;
  next = C.clone(next);
  // Book edits, appearance, backup timestamps and Undo must not restore an old name.
  if (state && !opts.setLibraryName) next.libraryName = state.libraryName || "";
  next.revision = expected + 1;
  next.updatedAt = new Date().toISOString();
  try {
    if (db)
      await new Promise((resolve, reject) => {
        const t = db.transaction("state", "readwrite"),
          s = t.objectStore("state");
        let problem;
        const get = s.get("main");
        get.onsuccess = () => {
          if ((get.result?.revision || 0) !== expected) {
            problem = Error(
              I18n.t(
                "La bibliothèque a changé dans un autre onglet. Sauvegardez votre fiche puis rechargez cette page avant de continuer.",
              ),
            );
            t.abort();
            return;
          }
          if (opts.beforeImport) s.put(state, "before-import");
          if (opts.purgeTrash) s.delete("before-import");
          s.put(next, "main");
        };
        t.oncomplete = resolve;
        t.onerror = () =>
          reject(
            problem || t.error || Error(I18n.t("Impossible d’enregistrer.")),
          );
        t.onabort = () =>
          reject(
            problem || t.error || Error(I18n.t("Enregistrement interrompu.")),
          );
      });
    const previous = state;
    state = next;
    syncLibraryName(previous);
    if (opts.history !== false && previous) rememberHistory(previous, next);
    channel?.postMessage({ revision: state.revision });
    storageStatus();
    return true;
  } finally {
    busy = false;
    commitIdleWaiters.splice(0).forEach((resolve) => resolve());
    updateHistoryButtons();
  }
}
function historyMeta(value) {
  const meta = C.clone(value);
  delete meta.books;
  delete meta.revision;
  delete meta.updatedAt;
  return meta;
}
function rememberHistory(before, after) {
  const oldBooks = new Map(before.books.map((b, i) => [b.id, [b, i]]));
  const newBooks = new Map(after.books.map((b, i) => [b.id, [b, i]]));
  const changed = [];
  for (const id of new Set([...oldBooks.keys(), ...newBooks.keys()])) {
    const old = oldBooks.get(id),
      current = newBooks.get(id);
    if (
      JSON.stringify(old?.[0] ?? null) !== JSON.stringify(current?.[0] ?? null)
    )
      changed.push({
        id,
        before: old ? C.clone(old[0]) : null,
        after: current ? C.clone(current[0]) : null,
        beforeIndex: old?.[1] ?? -1,
        afterIndex: current?.[1] ?? -1,
      });
  }
  const beforeMeta = historyMeta(before),
    afterMeta = historyMeta(after);
  if (
    !changed.length &&
    JSON.stringify(beforeMeta) === JSON.stringify(afterMeta)
  )
    return;
  const entry = {
    books: changed,
    beforeOrder: before.books.map((b) => b.id),
    afterOrder: after.books.map((b) => b.id),
    beforeMeta,
    afterMeta,
  };
  if (JSON.stringify(entry).length > HISTORY_ENTRY_LIMIT) {
    undoHistory.length = 0;
    redoHistory.length = 0;
    toast(
      I18n.t("Cette modification dépasse la limite de l’historique."),
      true,
    );
    return;
  }
  undoHistory.push(entry);
  if (undoHistory.length > HISTORY_LIMIT) undoHistory.shift();
  redoHistory.length = 0;
}
function applyHistoryEntry(entry, direction) {
  const useBefore = direction === "before",
    books = new Map(state.books.map((b) => [b.id, C.clone(b)]));
  for (const change of entry.books) {
    const value = change[direction];
    if (value) books.set(change.id, C.clone(value));
    else books.delete(change.id);
  }
  const order = entry[useBefore ? "beforeOrder" : "afterOrder"];
  const next = C.clone(state);
  Object.assign(next, C.clone(entry[useBefore ? "beforeMeta" : "afterMeta"]));
  next.books = [...order.map((id) => books.get(id)).filter(Boolean)];
  for (const [id, book] of books)
    if (!order.includes(id)) next.books.push(book);
  return next;
}
async function undoChange() {
  const entry = undoHistory.at(-1);
  if (!entry || busy) return;
  try {
    await commit(applyHistoryEntry(entry, "before"), { history: false });
    undoHistory.pop();
    redoHistory.push(entry);
    render();
    toast(I18n.t("Modification annulée."));
  } catch (err) {
    fail(err);
  }
  updateHistoryButtons();
}
async function redoChange() {
  const entry = redoHistory.at(-1);
  if (!entry || busy) return;
  try {
    await commit(applyHistoryEntry(entry, "after"), { history: false });
    redoHistory.pop();
    undoHistory.push(entry);
    render();
    toast(I18n.t("Modification rétablie."));
  } catch (err) {
    fail(err);
  }
  updateHistoryButtons();
}
function updateHistoryButtons() {
  const undo = $("#undo-btn"),
    redo = $("#redo-btn");
  if (undo) undo.disabled = !undoHistory.length || busy;
  if (redo) redo.disabled = !redoHistory.length || busy;
}
function storageStatus() {
  $("#storage-state").textContent = volatile
    ? I18n.t("Mémoire temporaire uniquement")
    : I18n.t("Enregistré sur cet appareil");
  $("#storage-dot").style.background = volatile ? "#c47a2c" : "";
  if (state.lastBackup)
    $("#backup-state").textContent =
      I18n.t("Dernière sauvegarde : ") +
      new Date(state.lastBackup).toLocaleString(locale, {
        dateStyle: "short",
        timeStyle: "short",
      }) +
      ".";
}
// A fresh installation starts empty. Loading an existing state never injects example books.
async function boot() {
  const seed = C.validate(JSON.parse($("#seed").textContent));
  try {
    db = await openDB();
    state = await load();
    if (state) {
      state = C.validate(state);
    } else {
      state = { ...seed, revision: 0 };
      await commit(state);
    }
  } catch (e) {
    if (state) {
      modal(
        I18n.t("Bibliothèque non ouverte"),
        I18n.html(
          "<p>Les données présentes sur cet appareil n’ont pas pu être lues. Elles n’ont pas été remplacées.</p><p>",
        ) +
          C.esc(e.message) +
          "</p>",
      );
      return;
    }
    volatile = true;
    state = { ...seed, revision: 0 };
    toast(
      I18n.t(
        "Le navigateur refuse le stockage local. Utilisez Sauvegarder avant de fermer la page.",
      ),
      true,
    );
  }
  try {
    await recoverLibraryName();
  } catch (error) {
    fail(error);
  }
  for (const id of new Set(state.books.flatMap((b) => b.colors)))
    if (!state.palette.some((c) => c.id === id))
      state.palette.push({ id, name: id, hex: "#b4b6bb" });
  if (db) {
    try {
      sidebarCollapsed = (await load("ui"))?.sidebarCollapsed === true;
    } catch {}
  }
  $("#library-name").value = state.libraryName || "";
  $("#app-name").textContent = state.libraryName || "";
  document.title =
    (state.libraryName ? state.libraryName + " · " : "") +
    I18n.t("Bibliothèque");
  syncSidebar();
  storageStatus();
  render();
  if (volatile) {
    const msg = document.createElement("div");
    msg.className = "notice";
    msg.textContent = I18n.t(
      "Mémoire temporaire : les modifications disparaîtront à la fermeture. Le bouton Sauvegarder crée un fichier complet à réimporter.",
    );
    $(".heading").after(msg);
  }
}
// Appearance drafts are previewed immediately, but only Apply commits them.
const appearanceDefaults = {
  accent: "#004d65",
  background: "#f3f4f6",
  filters: "#dce9ed",
};
function appearanceValues(value = state?.appearance) {
  return Object.fromEntries(
    Object.entries(appearanceDefaults).map(([k, v]) => [
      k,
      /^#[0-9a-f]{6}$/i.test(value?.[k] || "") ? value[k] : v,
    ]),
  );
}
function rgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function mixColor(a, b, weight) {
  return (
    "#" +
    rgb(a)
      .map((v, i) =>
        Math.round(v * (1 - weight) + rgb(b)[i] * weight)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function luminance(hex) {
  const c = rgb(hex).map((v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
let appearanceDraft = null;
function applyAppearance(
  value = appearanceDraft || state?.appearance,
  syncInputs = true,
) {
  const a = appearanceValues(value),
    bg = a.background,
    dark = luminance(bg) < 0.3,
    neutral = bg.toLowerCase() === appearanceDefaults.background;
  const ink = dark ? "#f3f4f6" : "#2d2436",
    vars = {
      "--filter-bg": a.filters,
      "--filter-ink": luminance(a.filters) > 0.179 ? "#20333b" : "#ffffff",
      "--red": a.accent,
      "--red-dark": mixColor(a.accent, "#000000", 0.2),
      "--accent-ink": luminance(a.accent) > 0.179 ? "#1b1b1b" : "#ffffff",
      "--paper": bg,
      "--ink": ink,
      "--muted": neutral ? "#75667e" : mixColor(bg, ink, 0.68),
      "--white": neutral
        ? "#ffffff"
        : mixColor(bg, "#ffffff", dark ? 0.06 : 0.85),
      "--soft": neutral ? "#e9ecf0" : mixColor(bg, ink, 0.08),
      "--line": neutral ? "#dfe2e7" : mixColor(bg, ink, 0.17),
      "--sidebar-bg": neutral ? "#eceef2" : mixColor(bg, ink, 0.035),
      "--selected-bg": neutral ? "#e0e4e9" : mixColor(bg, ink, 0.12),
      "--accent-soft": mixColor(bg, a.accent, 0.12),
    };
  for (const [k, v] of Object.entries(vars))
    document.documentElement.style.setProperty(k, v);
  if (syncInputs)
    for (const k of ["accent", "background", "filters"]) {
      $("#appearance-" + k).value = a[k];
      $("#appearance-" + k + "-hex").value = a[k];
    }
}
// Navigation and filtering operate on a scope first, then on the current query.
function renderNav() {
  const a = active(),
    nav = [
      ["all", "books", I18n.t("Tous mes livres"), a.length],
      [
        "favorites",
        "star",
        I18n.t("Favoris"),
        a.filter((b) => b.favorite).length,
      ],
      ["notes", "note", I18n.t("Avec des notes"), a.filter(hasNotes).length],
      [
        "images",
        "image",
        I18n.t("Avec des images"),
        a.filter((b) => C.noteImages(b).length).length,
      ],
      [
        "trash",
        "trash",
        I18n.t("Corbeille"),
        state.books.filter((b) => b.deletedAt).length,
      ],
    ];
  $("#navigation").innerHTML = nav
    .map(
      ([id, i, n, c]) =>
        '<button class="nav-button ' +
        (scope === id ? "active" : "") +
        '" data-scope="' +
        id +
        '">' +
        icon(i) +
        "<span>" +
        n +
        '</span><span class="count">' +
        c +
        "</span></button>",
    )
    .join("");
  const cols = [...new Set(a.map((b) => b.collection || C.NO_COLLECTION))].sort(
    (a, b) => a.localeCompare(b, locale),
  );
  $("#collections").innerHTML = cols
    .map(
      (c) =>
        '<button class="nav-button ' +
        (scope === "collection:" + c ? "active" : "") +
        '" data-scope="collection:' +
        C.esc(c) +
        '">' +
        icon("book") +
        "<span>" +
        C.esc(c === C.NO_COLLECTION ? I18n.t("Sans collection") : c) +
        '</span><span class="count">' +
        a.filter((b) => (b.collection || C.NO_COLLECTION) === c).length +
        "</span></button>",
    )
    .join("");
  $$("[data-scope]").forEach(
    (el) => (el.onclick = () => navigateScope(el.dataset.scope)),
  );
}
function navigateScope(nextScope) {
  bulkIds.clear();
  scope = nextScope;
  page = 1;
  $("#search").value = "";
  resetFilters(false);
  render();
  closeSidebar();
}
function options(el, items, label) {
  const value = el.value;
  el.innerHTML =
    '<option value="">' +
    C.esc(label) +
    "</option>" +
    items
      .map(
        ([v, n]) =>
          '<option value="' + C.esc(v) + '">' + C.esc(n) + "</option>",
      )
      .join("");
  el.value = value;
}
const extraFilterFields = () => ({
  collection: "Collection",
  author: I18n.t("Auteur(s)"),
  publisher: I18n.t("Éditeur"),
  language: I18n.t("Langue"),
  condition: I18n.t("État"),
  location: I18n.t("Emplacement"),
  year: I18n.t("Année / édition"),
  loanName: I18n.t("Prêt à"),
});
const filterIds = () => $$("#filters select,#filters input").map((el) => el.id);
function extraFilters() {
  return Object.fromEntries(
    [
      ...Object.keys(extraFilterFields()),
      "loan",
      "favorite",
      "pagesMin",
      "pagesMax",
      "loanFrom",
      "loanTo",
    ].map((k) => [k, $("#extra-" + k).value]),
  );
}
function renderFilters() {
  for (const [key, label] of Object.entries(extraFilterFields())) {
    const values = [
      ...new Set(
        scopeBooks()
          .map((b) => b[key])
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, locale));
    if (key === "condition")
      C.CONDITIONS.forEach((x) => {
        if (!values.includes(x)) values.push(x);
      });
    options(
      $("#extra-" + key),
      [
        ["__empty__", I18n.t("Non renseigné")],
        ...values.map((v) => [v, key === "condition" ? enumLabel(v) : v]),
      ],
      I18n.t("Tous / toutes"),
    );
  }
  const base = scopeBooks(),
    unique = (k) =>
      [...new Set(base.map((b) => b[k]).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, locale))
        .map((t) => [t, t]);
  options(
    $("#theme-filter"),
    [...new Set(base.flatMap((b) => b.themes))]
      .sort((a, b) => a.localeCompare(b, locale))
      .map((t) => [t, t]),
    I18n.t("Tous les domaines / thèmes"),
  );
  options(
    $("#color-filter"),
    state.palette.map((c) => [c.id, c.name]),
    I18n.t("Toutes les couleurs"),
  );
  options($("#shelf-filter"), unique("shelf"), I18n.t("Toutes les étagères"));
  options($("#type-filter"), unique("bookType"), I18n.t("Tous les types"));
  $("#shelf-filter").parentElement.hidden = !base.some((b) => b.shelf);
  $("#type-filter").parentElement.hidden = !base.some((b) => b.bookType);
  $("#color-filter").parentElement.hidden = !base.some((b) => b.colors.length);
}
function scopeBooks() {
  return state.books.filter((b) =>
    scope === "trash"
      ? b.deletedAt
      : !b.deletedAt &&
        (scope === "all" ||
          (scope === "favorites" && b.favorite) ||
          (scope === "notes" && hasNotes(b)) ||
          (scope === "images" && C.noteImages(b).length) ||
          (scope.startsWith("collection:") &&
            (b.collection || C.NO_COLLECTION) === scope.slice(11))),
  );
}
function filtered() {
  const q = C.norm($("#search").value).trim(),
    theme = $("#theme-filter").value,
    col = $("#color-filter").value,
    status = $("#status-filter").value,
    shelf = $("#shelf-filter").value,
    type = $("#type-filter").value;
  const extra = extraFilters();
  const list = scopeBooks().filter(
    (b) =>
      C.matchesFields(b, extra) &&
      (!contentFilter ||
        (contentFilter === "notes"
          ? hasNotes(b)
          : C.noteImages(b).length > 0)) &&
      (!q ||
        q
          .split(/\s+/)
          .every((word) =>
            C.norm(
              [
                b.title,
                b.number,
                b.author,
                b.notes,
                b.isbn,
                b.collection,
                b.location,
                b.shelf,
                b.bookType,
                b.publisher,
                b.loanName,
                b.loanDate,
                b.language,
                b.pages,
                b.condition,
                ...b.themes,
              ].join(" "),
            ).includes(word),
          )) &&
      (!theme || b.themes.includes(theme)) &&
      (!col || b.colors.includes(col)) &&
      (!shelf || b.shelf === shelf) &&
      (!type || b.bookType === type) &&
      (!status || (status === "none" ? !b.status : b.status === status)),
  );
  const sort = $("#sort").value,
    collator = new Intl.Collator(locale, {
      numeric: true,
      sensitivity: "base",
    });
  list.sort((a, b) => C.compareBooks(a, b, sort, locale, collator));
  return list;
}
function render() {
  applyAppearance();
  renderNav();
  renderFilters();
  renderList();
}
let bulkMode = false;
let duplicatingSelection = false;
const bulkIds = new Set();
function renderList() {
  $("#trash-actions").hidden = scope !== "trash";
  $("#empty-trash-top").disabled = !state.books.some((b) => b.deletedAt);
  const base = scopeBooks(),
    list = filtered();
  const title = scope.startsWith("collection:")
    ? scope.slice(11) === C.NO_COLLECTION
      ? I18n.t("Sans collection")
      : scope.slice(11)
    : {
        all: I18n.t("Ma bibliothèque"),
        favorites: I18n.t("Mes favoris"),
        notes: I18n.t("Mes notes de lecture"),
        images: I18n.t("Mes images"),
        trash: I18n.t("Corbeille"),
      }[scope];
  $("#page-title").textContent = title;
  $("#page-title").title = title;
  $("#page-subtitle").hidden = scope !== "trash";
  $("#page-subtitle").textContent =
    scope === "trash"
      ? I18n.t("Les livres retirés restent ici et peuvent être restaurés.")
      : "";
  $("#collection-backup-btn").hidden = !scope.startsWith("collection:");
  $("#clear-search").hidden = !$("#search").value;
  $("#stats").innerHTML =
    "<span><strong>" +
    base.length +
    I18n.html(
      '</strong> livres</span><i class="divider"></i><button class="stat-link ',
    ) +
    (scope === "notes" || contentFilter === "notes" ? "active" : "") +
    I18n.html('" id="stat-notes" title="Afficher les livres annotés">') +
    icon("note") +
    "<strong>" +
    base.filter(hasNotes).length +
    I18n.html(
      '</strong> annotés</button><i class="divider"></i><button class="stat-link ',
    ) +
    (scope === "images" || contentFilter === "images" ? "active" : "") +
    I18n.html(
      '" id="stat-images" title="Afficher les livres avec des images dans les notes, hors couvertures">',
    ) +
    icon("image") +
    "<strong>" +
    base.filter((b) => C.noteImages(b).length > 0).length +
    I18n.html("</strong> avec images</button>");
  $("#stat-notes").onclick = () => toggleContentFilter("notes");
  $("#stat-images").onclick = () => toggleContentFilter("images");
  $("#stat-notes").setAttribute(
    "aria-pressed",
    String(scope === "notes" || contentFilter === "notes"),
  );
  $("#stat-images").setAttribute(
    "aria-pressed",
    String(scope === "images" || contentFilter === "images"),
  );
  const nFilters = [
    contentFilter,
    ...filterIds().map((id) => $("#" + id).value),
  ].filter(Boolean).length;
  $("#filter-count").textContent = nFilters ? "(" + nFilters + ")" : "";
  $("#results-count").textContent =
    plural(list.length, I18n.t("livre")) +
    (list.length !== base.length
      ? I18n.t(" sur ") + base.length
      : I18n.t(" dans cette sélection"));
  page = Math.max(1, Math.min(page, Math.ceil(list.length / pageSize)));
  const chunk = list.slice((page - 1) * pageSize, page * pageSize);
  if (!list.length)
    $("#books").innerHTML =
      '<div class="empty">' +
      icon("books") +
      I18n.html("<h2>Aucun livre ici pour le moment</h2><p>") +
      ($("#search").value || nFilters
        ? I18n.t("Essayez une autre recherche ou effacez les filtres.")
        : scope === "trash"
          ? I18n.t("Aucun livre retiré.")
          : I18n.t("Ajoutez un livre pour commencer.")) +
      "</p></div>";
  else if (
    view === "table" &&
    chunk.some((b) => b.author || b.shelf) &&
    !chunk.some((b) => b.number)
  )
    $("#books").innerHTML = proTable(chunk);
  else if (view === "table")
    $("#books").innerHTML =
      I18n.html(
        '<div class="table-wrap"><table><colgroup><col class="name-col" style="width:39%"><col style="width:24%"><col style="width:10%"><col class="theme-col" style="width:18%"><col class="note-col" style="width:9%"></colgroup><thead><tr><th><button data-sort="title">Nom</button></th><th><button data-sort="number">N° et sous-titre</button></th><th>Couleur</th><th>Thématique</th><th>Notes</th></tr></thead><tbody>',
      ) +
      chunk
        .map((b) => {
          const im = b.images.find((x) => x.role === "cover");
          return (
            '<tr><td><div class="title-cell"><span class="book-mark" style="background:' +
            (b.colors.length ? color(b.colors[0]).hex : "#d5cbbb") +
            '">' +
            (im ? '<img alt="" src="' + im.data + '">' : "") +
            '</span><button class="book-open" data-book="' +
            C.esc(b.id) +
            '">' +
            C.esc(b.title) +
            (b.favorite
              ? I18n.html(
                  '<span style="color:var(--gold);font-size:12px" aria-label="Favori">★</span>',
                )
              : "") +
            '</button></div></td><td class="number">' +
            C.esc(b.number || "·") +
            "</td><td>" +
            swatches(b.colors) +
            "</td><td>" +
            badges(b.themes) +
            '</td><td><button class="note-count" data-book="' +
            C.esc(b.id) +
            I18n.html('" aria-label="Ouvrir les notes de ') +
            C.esc(b.title) +
            '">' +
            (hasNotes(b) ? icon("note") : '<span style="opacity:.3">·</span>') +
            (C.noteImages(b).length ? icon("image") : "") +
            "</button></td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>";
  else
    $("#books").innerHTML =
      '<div class="grid">' +
      chunk
        .map((b) => {
          const im = b.images.find((x) => x.role === "cover");
          return (
            '<article class="book-card">' +
            (b.favorite
              ? I18n.html(
                  '<span class="favorite-pin" aria-label="Favori">★</span>',
                )
              : "") +
            '<button class="cover subtle" style="width:100%;padding:0" data-book="' +
            C.esc(b.id) +
            I18n.html('" aria-label="Ouvrir ') +
            C.esc(b.title) +
            '">' +
            (im
              ? '<img src="' +
                im.data +
                I18n.html('" alt="Couverture de ') +
                C.esc(b.title) +
                '">'
              : '<div class="faux-cover ' +
                (C.isQueSaisJe(b.collection)
                  ? "que-sais-je"
                  : C.isPenguin(b.collection)
                    ? "penguin"
                    : "") +
                '" style="--cover-color:' +
                (b.colors.length ? color(b.colors[0]).hex : "#ded3bc") +
                '"><small>' +
                C.esc(b.collection || I18n.t("Bibliothèque")) +
                "</small><strong>" +
                C.esc(b.title) +
                "</strong><small>" +
                C.esc(b.number) +
                "</small></div>") +
            '</button><h3><button class="book-open" data-book="' +
            C.esc(b.id) +
            '">' +
            C.esc(b.title) +
            "</button></h3>" +
            (b.number
              ? '<p class="card-number muted">' + C.esc(b.number) + "</p>"
              : "") +
            (b.author
              ? '<p class="card-author muted">' + C.esc(b.author) + "</p>"
              : "") +
            badges(b.themes) +
            "</article>"
          );
        })
        .join("") +
      "</div>";
  $("#pager").innerHTML =
    "<span>" +
    (list.length
      ? (page - 1) * pageSize +
        1 +
        "–" +
        Math.min(page * pageSize, list.length) +
        I18n.t(" sur ") +
        list.length
      : "") +
    I18n.html(
      '</span><div><button id="prev-page" aria-label="Page précédente" ',
    ) +
    (page <= 1 ? "disabled" : "") +
    ">" +
    icon("left") +
    "</button><span>" +
    page +
    " / " +
    Math.max(1, Math.ceil(list.length / pageSize)) +
    I18n.html('</span><button id="next-page" aria-label="Page suivante" ') +
    (page * pageSize >= list.length ? "disabled" : "") +
    ">" +
    icon("right") +
    "</button></div>";
  $("#prev-page").onclick = () => {
    page--;
    renderList();
    $(".toolbar").scrollIntoView({ block: "start" });
  };
  $("#next-page").onclick = () => {
    page++;
    renderList();
    $(".toolbar").scrollIntoView({ block: "start" });
  };
  renderBulkSelection(list);
  $$("[data-book]").forEach(
    (el) =>
      (el.onclick = () => {
        if (bulkMode && scope !== "trash") {
          const id = el.dataset.book;
          bulkIds.has(id) ? bulkIds.delete(id) : bulkIds.add(id);
          syncBulkVisuals();
        } else openBook(el.dataset.book);
      }),
  );
  $$("[data-sort]").forEach(
    (el) =>
      (el.onclick = () => {
        $("#sort").value =
          $("#sort").value === el.dataset.sort
            ? el.dataset.sort + "-desc"
            : el.dataset.sort;
        page = 1;
        renderList();
      }),
  );
}
async function emptyTrash(onlyId = null) {
  const targeted = (b) => b.deletedAt && (!onlyId || b.id === onlyId);
  const count = state.books.filter(targeted).length;
  if (!count || busy) return;
  if (
    !confirm(
      I18n.t(
        onlyId
          ? "Supprimer définitivement ce livre ?"
          : "Vider toute la corbeille ?",
      ) +
        "\n" +
        count +
        " " +
        I18n.t(
          "livre(s) seront supprimés avec leurs notes et images. Cette action est définitive et efface l’historique Annuler/Rétablir ainsi que la copie précédant le dernier import.",
        ),
    )
  )
    return;
  try {
    await commit(
      { ...state, books: state.books.filter((b) => !targeted(b)) },
      { history: false, purgeTrash: true },
    );
    undoHistory.length = 0;
    redoHistory.length = 0;
    bulkIds.clear();
    updateHistoryButtons();
    render();
    if (draft && (onlyId === draft.id || (!onlyId && draft.deletedAt)))
      closeDrawer(true);
    toast(
      I18n.t(
        onlyId ? "Livre supprimé définitivement." : "La corbeille a été vidée.",
      ),
    );
  } catch (e) {
    fail(e);
  }
}
function renderBulkSelection(list) {
  $("#books").classList.toggle("selecting", bulkMode && scope !== "trash");
  const available = new Set(list.filter((b) => !b.deletedAt).map((b) => b.id));
  for (const id of bulkIds) if (!available.has(id)) bulkIds.delete(id);
  $("#bulk-bar").innerHTML =
    scope === "trash"
      ? '<button class="small danger" id="empty-trash" ' +
        (state.books.some((b) => b.deletedAt) ? "" : "disabled") +
        ">" +
        I18n.t("Vider la corbeille") +
        "</button>"
      : '<button class="small" id="select-books" aria-pressed="' +
        bulkMode +
        '">' +
        (bulkMode ? I18n.t("Terminer la sélection") : I18n.t("Sélectionner")) +
        "</button>" +
        (bulkMode
          ? '<span id="bulk-count" aria-live="polite">' +
            bulkIds.size +
            I18n.html(
              ' sélectionné(s)</span><button class="small" id="select-results">Tous les résultats (',
            ) +
            available.size +
            I18n.html(
              ')</button><button class="small subtle" id="clear-selection">Désélectionner</button><button class="small" id="remove-selected">Retirer</button><button class="small" id="duplicate-selected" aria-label="Dupliquer la sélection" ',
            ) +
            (!bulkIds.size || duplicatingSelection ? "disabled" : "") +
            I18n.html(
              '>Dupliquer</button><button class="small primary" id="bulk-edit" ',
            ) +
            (!bulkIds.size ? "disabled" : "") +
            I18n.html(
              '>Modifier la sélection</button><button class="small" id="export-selected" ',
            ) +
            (!bulkIds.size ? "disabled" : "") +
            I18n.html(">Exporter PDF</button>")
          : "");
  if ($("#select-books"))
    $("#select-books").onclick = () => {
      bulkMode = !bulkMode;
      bulkIds.clear();
      renderList();
    };
  if ($("#select-results"))
    $("#select-results").onclick = () => {
      available.forEach((id) => bulkIds.add(id));
      renderList();
    };
  if ($("#clear-selection"))
    $("#clear-selection").onclick = () => {
      bulkIds.clear();
      renderList();
    };
  if ($("#bulk-edit")) $("#bulk-edit").onclick = openBulkEditor;
  if ($("#export-selected")) $("#export-selected").onclick = exportSelectedPDF;
  if ($("#duplicate-selected"))
    $("#duplicate-selected").onclick = duplicateSelectedBooks;
  if ($("#remove-selected"))
    $("#remove-selected").onclick = async () => {
      const ids = [...bulkIds],
        books = state.books.filter((b) => ids.includes(b.id) && !b.deletedAt);
      if (!books.length) return;
      if (
        !confirm(
          I18n.t("Déplacer les ") +
            books.length +
            I18n.t(" livres sélectionnés dans la corbeille ?"),
        )
      )
        return;
      try {
        const next = C.clone(state),
          removedAt = new Date().toISOString();
        for (const b of next.books)
          if (ids.includes(b.id) && !b.deletedAt) b.deletedAt = removedAt;
        await commit(next);
        bulkIds.clear();
        bulkMode = false;
        render();
        toast(books.length + I18n.t(" livres déplacés dans la corbeille."));
      } catch (err) {
        fail(err);
      }
    };
  const seen = new Set();
  $$("[data-book]").forEach((button) => {
    const id = button.dataset.book;
    if (seen.has(id)) return;
    seen.add(id);
    const b = state.books.find((b) => b.id === id),
      row = button.closest("tr"),
      card = button.closest("article");
    if (b.loanName || b.loanDate) {
      const tag = document.createElement("span");
      tag.className = "loan-badge";
      tag.textContent =
        I18n.t("Prêt") +
        (b.loanName ? I18n.t(" à ") + b.loanName : "") +
        (b.loanDate ? " · " + b.loanDate.split("-").reverse().join("/") : "");
      (card || row?.querySelector("td"))?.append(tag);
    }
    if (!bulkMode || b.deletedAt) return;
    const label = document.createElement("label");
    label.className = "bulk-check";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = bulkIds.has(id);
    checkbox.setAttribute("aria-label", I18n.t("Sélectionner ") + b.title);
    checkbox.onchange = () => {
      if (checkbox.checked) bulkIds.add(id);
      else bulkIds.delete(id);
      renderList();
    };
    label.append(checkbox);
    if (card) {
      card.dataset.selectId = id;
      label.append(document.createTextNode(I18n.t("Sélectionner")));
      card.prepend(label);
    } else row?.querySelector(".title-cell")?.prepend(label);
    (card || row)?.classList.toggle("bulk-selected", bulkIds.has(id));
  });
}
// Commit every copy together, then select only those copies for the next action.
async function duplicateSelectedBooks() {
  if (
    busy ||
    imagesProcessing ||
    duplicatingSelection ||
    !bulkIds.size ||
    scope === "trash"
  )
    return;
  const ids = new Set(bulkIds);
  duplicatingSelection = true;
  syncBulkVisuals();
  try {
    await ensureLibraryNameSaved();
    const copies = state.books
      .filter((book) => ids.has(book.id) && !book.deletedAt)
      .map((book) => {
        const copy = C.duplicateBook(book);
        copy.title += I18n.t(" (copie)");
        return copy;
      });
    if (!copies.length) return;
    const next = { ...state, books: [...state.books, ...copies] };
    C.validate(next);
    await commit(next);
    bulkIds.clear();
    copies.forEach((book) => bulkIds.add(book.id));
    bulkMode = true;
    const position = filtered().findIndex((book) => bulkIds.has(book.id));
    page = position < 0 ? 1 : Math.floor(position / pageSize) + 1;
    render();
    toast(
      plural(
        copies.length,
        I18n.t("fiche dupliquée"),
        I18n.t("fiches dupliquées"),
      ) + I18n.t(". Les copies sont sélectionnées."),
    );
  } catch (error) {
    fail(error);
  } finally {
    duplicatingSelection = false;
    syncBulkVisuals();
  }
}
function syncBulkVisuals() {
  if ($("#bulk-count"))
    $("#bulk-count").textContent = bulkIds.size + I18n.t(" sélectionné(s)");
  if ($("#bulk-edit")) $("#bulk-edit").disabled = !bulkIds.size;
  if ($("#export-selected")) $("#export-selected").disabled = !bulkIds.size;
  if ($("#duplicate-selected"))
    $("#duplicate-selected").disabled = !bulkIds.size || duplicatingSelection;
  $$(".book-card[data-select-id]").forEach((card) => {
    const selected = bulkIds.has(card.dataset.selectId);
    card.classList.toggle("bulk-selected", selected);
    const check = card.querySelector(".bulk-check input");
    if (check) check.checked = selected;
  });
  $$("#books tr").forEach((row) => {
    const id = row.querySelector("[data-book]")?.dataset.book,
      check = row.querySelector(".bulk-check input");
    if (check) {
      check.checked = bulkIds.has(id);
      row.classList.toggle("bulk-selected", check.checked);
    }
  });
}
// Drag selection is based on a snapshot. Reversing a drag restores the initial set.
let selectionGesture = null,
  suppressSelectionClickUntil = 0,
  selectionFrame = 0;
function updateSelectionGesture(x, y) {
  const g = selectionGesture;
  if (!g) return;
  g.x = x;
  g.y = y;
  const card = document
    .elementFromPoint(x, y)
    ?.closest(".book-card[data-select-id]");
  const index = card ? g.ids.indexOf(card.dataset.selectId) : -1;
  if (index < 0) return;
  bulkIds.clear();
  g.before.forEach((id) => bulkIds.add(id));
  for (let i = Math.min(g.start, index); i <= Math.max(g.start, index); i++)
    g.select ? bulkIds.add(g.ids[i]) : bulkIds.delete(g.ids[i]);
  syncBulkVisuals();
}
function scrollSelectionGesture() {
  const g = selectionGesture;
  if (!g) return;
  const edge = 70,
    delta =
      g.y < edge
        ? -Math.ceil((edge - g.y) / 5)
        : g.y > innerHeight - edge
          ? Math.ceil((g.y - innerHeight + edge) / 5)
          : 0;
  if (delta) {
    window.scrollBy(0, delta);
    updateSelectionGesture(g.x, g.y);
  }
  selectionFrame = requestAnimationFrame(scrollSelectionGesture);
}
$("#books").addEventListener("pointerdown", (e) => {
  if (
    !bulkMode ||
    view !== "grid" ||
    scope === "trash" ||
    e.button !== 0 ||
    e.isPrimary === false ||
    e.target.closest(".bulk-check")
  )
    return;
  const card = e.target.closest(".book-card[data-select-id]");
  if (!card) return;
  const ids = $$(".book-card[data-select-id]").map((c) => c.dataset.selectId),
    id = card.dataset.selectId;
  selectionGesture = {
    pointer: e.pointerId,
    ids,
    start: ids.indexOf(id),
    select: !bulkIds.has(id),
    before: new Set(bulkIds),
    x: e.clientX,
    y: e.clientY,
  };
  $("#books").setPointerCapture(e.pointerId);
  e.preventDefault();
  updateSelectionGesture(e.clientX, e.clientY);
  selectionFrame = requestAnimationFrame(scrollSelectionGesture);
});
$("#books").addEventListener("pointermove", (e) => {
  if (selectionGesture?.pointer !== e.pointerId) return;
  e.preventDefault();
  updateSelectionGesture(e.clientX, e.clientY);
});
function finishSelectionGesture(e) {
  if (selectionGesture?.pointer !== e.pointerId) return;
  selectionGesture = null;
  cancelAnimationFrame(selectionFrame);
  suppressSelectionClickUntil = performance.now() + 500;
  if ($("#books").hasPointerCapture(e.pointerId))
    $("#books").releasePointerCapture(e.pointerId);
}
$("#books").addEventListener("pointerup", finishSelectionGesture);
$("#books").addEventListener("pointercancel", finishSelectionGesture);
$("#books").addEventListener("lostpointercapture", finishSelectionGesture);
$("#books").addEventListener(
  "click",
  (e) => {
    if (!bulkMode || scope === "trash" || e.target.closest(".bulk-check"))
      return;
    const card = e.target.closest(".book-card[data-select-id]");
    if (!card) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (performance.now() < suppressSelectionClickUntil) return;
    const id = card.dataset.selectId;
    bulkIds.has(id) ? bulkIds.delete(id) : bulkIds.add(id);
    syncBulkVisuals();
  },
  true,
);
$("#books").addEventListener("dragstart", (e) => {
  if (bulkMode) e.preventDefault();
});
// Only explicitly checked fields are sent to the core bulk-update whitelist.
function openBulkEditor() {
  const ids = [...bulkIds],
    books = state.books.filter((b) => ids.includes(b.id));
  if (!books.length) return;
  const specs = [
    ["collection", "Collection"],
    ["author", I18n.t("Auteur(s)")],
    ["publisher", I18n.t("Éditeur")],
    ["shelf", I18n.t("Étagère")],
    ["bookType", I18n.t("Type de livre")],
    ["year", I18n.t("Année / édition")],
    ["location", I18n.t("Emplacement")],
    ["status", I18n.t("Lecture")],
    ["condition", I18n.t("État")],
    ["pages", I18n.t("Nombre de pages")],
    ["language", I18n.t("Langue")],
    ["colors", I18n.t("Couleur(s)")],
    ["themes", I18n.t("Domaines / thématiques")],
    ["favorite", I18n.t("Favori")],
    ["loan", I18n.t("Prêt")],
  ];
  const control = (key, label) => {
    if (key === "loan")
      return I18n.html(
        '<label for="bulk-loanName">Nom de la personne</label><input id="bulk-loanName" type="text"><label for="bulk-loanDate">Date de prêt</label><input id="bulk-loanDate" type="date"><p class="hint">Les deux champs vides retirent le prêt.</p>',
      );
    if (key === "colors")
      return state.palette
        .map(
          (c) =>
            '<label class="bulk-check"><input type="checkbox" data-bulk-color="' +
            C.esc(c.id) +
            '"><span class="swatch" style="background:' +
            c.hex +
            '"></span>' +
            C.esc(c.name) +
            "</label>",
        )
        .join(" ");
    if (key === "pages")
      return I18n.html(
        '<input id="bulk-pages" aria-label="Nombre de pages pour la sélection" type="number" min="1" step="1" inputmode="numeric">',
      );
    if (key === "condition")
      return (
        I18n.html(
          '<select id="bulk-condition" aria-label="Nouvel état"><option value="">Non renseigné</option>',
        ) +
        C.CONDITIONS.map(
          (v) =>
            '<option value="' + C.esc(v) + '">' + enumLabel(v) + "</option>",
        ).join("") +
        "</select>"
      );
    if (key === "status")
      return (
        I18n.html(
          '<select id="bulk-status" aria-label="Nouvelle lecture"><option value="">Non renseigné</option>',
        ) +
        C.STATUSES.map(
          (x) =>
            '<option value="' + C.esc(x) + '">' + enumLabel(x) + "</option>",
        ).join("") +
        "</select>"
      );
    if (key === "favorite")
      return I18n.html(
        '<select id="bulk-favorite" aria-label="Nouveau favori"><option value="true">Oui</option><option value="false">Non</option></select>',
      );
    return (
      '<input id="bulk-' +
      key +
      '" aria-label="' +
      C.esc(label) +
      ' pour la sélection" type="text">' +
      (key === "themes"
        ? I18n.html('<p class="hint">Valeurs séparées par des virgules.</p>')
        : "")
    );
  };
  modal(
    I18n.t("Modifier ") + books.length + I18n.t(" livres"),
    I18n.html("<p>Seuls les champs cochés sont remplacés sur les ") +
      books.length +
      I18n.html(
        " livres. Un champ coché laissé vide efface sa valeur. Les couleurs et thématiques choisies remplacent les listes actuelles.</p><details><summary>Livres concernés (",
      ) +
      books.length +
      ')</summary><ul class="bulk-targets">' +
      books.map((b) => "<li>" + C.esc(b.title) + "</li>").join("") +
      '</ul></details><form id="bulk-form">' +
      specs
        .map(
          ([key, label]) =>
            '<div class="bulk-field"><label><input class="bulk-enable" type="checkbox" data-bulk-enable="' +
            key +
            '">' +
            label +
            '</label><fieldset id="bulk-fields-' +
            key +
            '" disabled>' +
            control(key, label) +
            "</fieldset></div>",
        )
        .join("") +
      I18n.html(
        '<p class="hint">Titre, numéro, ISBN, couverture, notes et images jointes restent inchangés.</p></form>',
      ),
    I18n.html(
      '<button id="cancel-bulk">Annuler</button><button class="primary" id="save-bulk" type="submit" form="bulk-form" disabled>Appliquer aux ',
    ) +
      books.length +
      I18n.html(" livres</button>"),
  );
  $$("[data-bulk-enable]").forEach(
    (el) =>
      (el.onchange = () => {
        $("#bulk-fields-" + el.dataset.bulkEnable).disabled = !el.checked;
        $("#save-bulk").disabled = !$$("[data-bulk-enable]").some(
          (x) => x.checked,
        );
      }),
  );
  $("#cancel-bulk").onclick = () => $("#modal").close();
  $("#bulk-form").onsubmit = async (e) => {
    e.preventDefault();
    const patch = {};
    for (const el of $$("[data-bulk-enable]"))
      if (el.checked) {
        const k = el.dataset.bulkEnable;
        if (k === "loan") {
          patch.loanName = $("#bulk-loanName").value.trim();
          patch.loanDate = $("#bulk-loanDate").value;
        } else if (k === "colors")
          patch.colors = $$("[data-bulk-color]")
            .filter((x) => x.checked)
            .map((x) => x.dataset.bulkColor);
        else if (k === "themes")
          patch.themes = C.split($("#bulk-themes").value);
        else if (k === "favorite")
          patch.favorite = $("#bulk-favorite").value === "true";
        else patch[k] = $("#bulk-" + k).value.trim();
      }
    try {
      $("#save-bulk").disabled = true;
      await commit(C.bulkUpdate(state, ids, patch));
      $("#modal").close();
      bulkIds.clear();
      bulkMode = false;
      render();
      toast(books.length + I18n.t(" fiches modifiées."));
    } catch (err) {
      $("#save-bulk").disabled = false;
      fail(err);
    }
  };
}
function proTable(books) {
  return (
    I18n.html(
      '<div class="table-wrap"><table class="pro-table"><colgroup><col style="width:36%"><col style="width:23%"><col style="width:18%"><col style="width:16%"><col style="width:7%"></colgroup><thead><tr><th><button data-sort="title">Nom</button></th><th>Auteur(s)</th><th>Étagère</th><th>Domaine</th><th>Notes</th></tr></thead><tbody>',
    ) +
    books
      .map((b) => {
        const cover = b.images.find((im) => im.role === "cover");
        return (
          '<tr><td><div class="title-cell"><span class="book-mark">' +
          (cover
            ? '<img loading="lazy" src="' + cover.data + '" alt="">'
            : "") +
          '</span><button class="book-open" data-book="' +
          C.esc(b.id) +
          '">' +
          C.esc(b.title) +
          "</button></div></td><td>" +
          C.esc(b.author) +
          "</td><td>" +
          C.esc(b.shelf) +
          "</td><td>" +
          badges(b.themes) +
          '</td><td><button class="note-count" data-book="' +
          C.esc(b.id) +
          I18n.html('" aria-label="Ouvrir ') +
          C.esc(b.title) +
          '">' +
          (hasNotes(b)
            ? icon("note")
            : C.noteImages(b).length
              ? icon("image")
              : "·") +
          "</button></td></tr>"
        );
      })
      .join("") +
    "</tbody></table></div>"
  );
}
function toggleContentFilter(kind) {
  if (!scope.startsWith("collection:")) return navigateScope(kind);
  contentFilter = contentFilter === kind ? "" : kind;
  page = 1;
  renderList();
}
function resetFilters(doRender = true) {
  contentFilter = "";
  filterIds().forEach((id) => ($("#" + id).value = ""));
  page = 1;
  if (doRender) renderList();
}
// The editor holds a detached draft until Save. User text is escaped at render time.
function showDrawer() {
  opener = document.activeElement;
  $("#drawer").hidden = false;
  $("#drawer-shade").hidden = false;
  document.body.style.overflow = "hidden";
  closeSidebar();
  $("#close-drawer").focus();
}
function openBook(id) {
  selection = id;
  draft = C.clone(state.books.find((b) => b.id === id));
  editing = false;
  dirty = false;
  showDrawer();
  renderDetail();
}
function newBook() {
  selection = null;
  draft = C.book({
    collection:
      scope.startsWith("collection:") &&
      scope !== "collection:" + C.NO_COLLECTION
        ? scope.slice(11)
        : "",
  });
  editing = true;
  dirty = false;
  showDrawer();
  renderEditor();
  setTimeout(() => $("#f-title").focus(), 40);
}
function duplicateBook() {
  if (!draft || editing || busy || imagesProcessing || draft.deletedAt) return;
  draft = C.duplicateBook(draft);
  draft.title += I18n.t(" (copie)");
  selection = null;
  editing = true;
  dirty = true;
  renderEditor();
  $("#drawer-body").scrollTop = 0;
  $("#f-title").focus();
  $("#f-title").select();
}
function closeDrawer(force = false) {
  if (
    !force &&
    dirty &&
    !confirm(I18n.t("Fermer cette fiche sans enregistrer les modifications ?"))
  )
    return;
  $("#drawer").hidden = true;
  $("#drawer-shade").hidden = true;
  document.body.style.overflow = "";
  dirty = false;
  editing = false;
  draft = null;
  selection = null;
  opener?.focus();
}
function renderFavorite() {
  $("#favorite-btn").innerHTML = icon("star");
  $("#favorite-btn").setAttribute(
    "aria-pressed",
    draft.favorite ? "true" : "false",
  );
  $("#favorite-btn").setAttribute(
    "aria-label",
    draft.favorite
      ? I18n.t("Retirer des favoris")
      : I18n.t("Ajouter aux favoris"),
  );
}
function bindImages(root, b) {
  root
    .querySelectorAll("[data-image]")
    .forEach((btn) => (btn.onclick = () => showImage(b, btn.dataset.image)));
}
function renderDetail() {
  $("#drawer-label").textContent = draft.collection || I18n.t("Fiche du livre");
  renderFavorite();
  const im = draft.images.find((i) => i.role === "cover");
  const rows = [
    [I18n.t("N° et sous-titre"), C.esc(draft.number)],
    [I18n.t("Couleur"), swatches(draft.colors)],
    [I18n.t("Domaine / thème"), badges(draft.themes)],
    [I18n.t("Auteur(s)"), C.esc(draft.author)],
    [I18n.t("Éditeur"), C.esc(draft.publisher)],
    [I18n.t("Étagère"), C.esc(draft.shelf)],
    ["Type", C.esc(draft.bookType)],
    [I18n.t("Année"), C.esc(draft.year)],
    ["ISBN", C.esc(draft.isbn)],
    [I18n.t("Emplacement"), C.esc(draft.location)],
    [I18n.t("Nombre de pages"), C.esc(draft.pages)],
    [I18n.t("Langue"), C.esc(draft.language)],
    [I18n.t("État"), C.esc(enumLabel(draft.condition))],
    [I18n.t("Lecture"), C.esc(enumLabel(draft.status))],
    [I18n.t("Prêt à"), C.esc(draft.loanName)],
    [
      I18n.t("Date de prêt"),
      C.esc(
        draft.loanDate ? draft.loanDate.split("-").reverse().join("/") : "",
      ),
    ],
  ];
  const detached = draft.images.filter(
    (im) =>
      im.role !== "cover" &&
      !draft.notes.includes("(attachment:" + im.id + ")"),
  );
  $("#drawer-body").innerHTML =
    (draft.deletedAt
      ? I18n.html(
          '<div class="notice">Ce livre est dans la corbeille. Vous pouvez le restaurer.</div>',
        )
      : "") +
    (im
      ? '<button class="subtle" style="float:right;padding:0" data-image="' +
        C.esc(im.id) +
        '"><img class="detail-cover" src="' +
        im.data +
        I18n.html('" alt="Couverture"></button>')
      : "") +
    '<p class="eyebrow">' +
    C.esc(draft.collection || I18n.t("Bibliothèque")) +
    "</p><h2>" +
    C.esc(draft.title) +
    '</h2><dl class="detail-meta">' +
    rows
      .filter(([n, v]) => v && v !== '<span class="swatches"></span>')
      .map(([n, v]) => "<dt>" + n + "</dt><dd>" + v + "</dd>")
      .join("") +
    I18n.html(
      '</dl><h3 class="section-label">Mes notes</h3><div class="notes">',
    ) +
    (draft.notes.trim()
      ? C.renderNotes(draft.notes, draft.images)
      : I18n.html(
          '<p class="muted">Aucune note pour le moment. « Modifier » permet d’ajouter des idées, citations et repères de lecture.</p>',
        )) +
    "</div>" +
    (detached.length
      ? I18n.html(
          '<h3 class="section-label">Images jointes</h3><div class="notes">',
        ) +
        detached
          .map(
            (im) =>
              '<figure><button class="note-image" data-image="' +
              C.esc(im.id) +
              '"><img loading="lazy" src="' +
              im.data +
              '" alt="' +
              C.esc(im.caption || im.name) +
              '"></button><figcaption>' +
              C.esc(im.caption || im.name) +
              "</figcaption></figure>",
          )
          .join("") +
        "</div>"
      : "");
  $("#drawer-body").insertAdjacentHTML(
    "beforeend",
    '<div class="pdf-actions"><button id="pdf-full">' +
      icon("download") +
      I18n.html('PDF de la fiche complète</button><button id="pdf-notes">') +
      icon("download") +
      I18n.html("PDF des notes</button></div>"),
  );
  $("#pdf-full").onclick = () => exportBookPDF(false);
  $("#pdf-notes").onclick = () => exportBookPDF(true);
  $("#drawer-footer").innerHTML =
    '<div><button class="subtle danger small" id="delete-book">' +
    icon(draft.deletedAt ? "restore" : "trash") +
    (draft.deletedAt ? I18n.t("Restaurer") : I18n.t("Retirer")) +
    "</button></div><div>" +
    (draft.deletedAt
      ? ""
      : '<button id="duplicate-book" type="button" aria-label="' +
        I18n.t("Dupliquer la fiche") +
        '">' +
        icon("copy") +
        I18n.t("Dupliquer") +
        "</button>") +
    '<button class="primary" id="edit-book">' +
    icon("edit") +
    I18n.html("Modifier</button></div>");
  if (draft.deletedAt) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "danger small";
    button.id = "purge-book";
    button.textContent = I18n.t("Supprimer définitivement");
    button.onclick = () => emptyTrash(draft.id);
    $("#delete-book").after(button);
  }
  if (draft.loanDate || draft.loanName) {
    const returned = document.createElement("button");
    returned.type = "button";
    returned.id = "return-saved-book";
    returned.className = "small";
    returned.textContent = I18n.t("Livre rendu");
    returned.onclick = returnSavedBook;
    $("#delete-book").after(returned);
  }
  $("#edit-book").onclick = () => {
    editing = true;
    renderEditor();
  };
  if ($("#duplicate-book")) $("#duplicate-book").onclick = duplicateBook;
  $("#delete-book").onclick = () => removeBook();
  bindImages($("#drawer-body"), draft);
}
function pdfFilename(book, notesOnly, libraryName) {
  const stem =
    C.norm([book.title, book.number].filter(Boolean).join(" "))
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100) || I18n.t("livre");
  const slug = librarySlug(libraryName);
  return (
    stem + (slug ? "_" + slug : "") + (notesOnly ? "_notes" : "_fiche") + ".pdf"
  );
}
// iPad browsers do not reliably allow many automatic downloads. Generate the
// selected files locally, then expose an explicit download link for each one.
function exportSelectedPDF() {
  const books = C.clone(
    filtered().filter((book) => bulkIds.has(book.id) && !book.deletedAt),
  );
  if (!books.length) return;
  const dialog = modal(
    I18n.t("Exporter la sélection en PDF"),
    "<p>" +
      books.length +
      I18n.t(" fiche(s) sélectionnée(s).") +
      "</p>" +
      I18n.html(
        '<form id="selection-pdf-form"><fieldset><legend>Contenu</legend><label class="pdf-choice"><input type="radio" name="pdf-content" value="full" checked> Fiches complètes</label><label class="pdf-choice"><input type="radio" name="pdf-content" value="notes"> Notes uniquement</label></fieldset><fieldset><legend>Organisation</legend><label class="pdf-choice"><input type="radio" name="pdf-group" value="combined" checked> Un PDF pour toute la sélection</label><label class="pdf-choice"><input type="radio" name="pdf-group" value="separate"> Un PDF par livre</label></fieldset></form><p id="selection-pdf-progress" role="status"></p><div id="selection-pdf-downloads"></div>',
      ),
    I18n.html(
      '<button id="selection-pdf-cancel">Fermer</button><button class="primary" id="selection-pdf-generate" form="selection-pdf-form" type="submit">Générer les PDF</button>',
    ),
  );
  let cancelled = false,
    generating = false;
  const urls = [];
  const release = () => {
    urls.splice(0).forEach((url) => URL.revokeObjectURL(url));
  };
  dialog.addEventListener(
    "close",
    () => {
      cancelled = true;
      setTimeout(release, 60000);
    },
    { once: true },
  );
  $("#selection-pdf-cancel").onclick = () => dialog.close();
  $("#selection-pdf-form").onsubmit = async (event) => {
    event.preventDefault();
    if (generating) return;
    generating = true;
    const generate = $("#selection-pdf-generate"),
      progress = $("#selection-pdf-progress"),
      links = $("#selection-pdf-downloads");
    const notesOnly = $("input[name=pdf-content]:checked").value === "notes",
      separate = $("input[name=pdf-group]:checked").value === "separate";
    generate.disabled = true;
    $$("#selection-pdf-form fieldset").forEach((el) => (el.disabled = true));
    links.replaceChildren();
    release();
    try {
      await ensureLibraryNameSaved();
      const name = state.libraryName || "",
        palette = C.clone(state.palette),
        files = [];
      const update = (done) => {
        if (cancelled) throw Error("cancelled");
        progress.textContent =
          I18n.t("Préparation du PDF…") + " " + done + " / " + books.length;
      };
      update(0);
      if (separate) {
        for (const [index, book] of books.entries()) {
          update(index);
          const bytes = await LibraryPDF.create(
            book,
            palette,
            notesOnly,
            name,
            enumLabel,
          );
          if (cancelled) throw Error("cancelled");
          const url = URL.createObjectURL(
            new Blob([bytes], { type: "application/pdf" }),
          );
          urls.push(url);
          files.push({
            url,
            filename:
              String(index + 1).padStart(3, "0") +
              "_" +
              pdfFilename(book, notesOnly, name),
            title: [book.title, book.number].filter(Boolean).join(" · "),
          });
          update(index + 1);
        }
      } else {
        const bytes = await LibraryPDF.create(
          books,
          palette,
          notesOnly,
          name,
          enumLabel,
          update,
        );
        if (cancelled) throw Error("cancelled");
        const url = URL.createObjectURL(
          new Blob([bytes], { type: "application/pdf" }),
        );
        urls.push(url);
        files.push({
          url,
          filename:
            "bibliotheque" +
            (librarySlug(name) ? "_" + librarySlug(name) : "") +
            "_selection_" +
            (notesOnly ? "notes" : "fiches") +
            ".pdf",
          title: I18n.t("Toute la sélection"),
        });
      }
      for (const file of files) {
        const row = document.createElement("div");
        row.className = "selection-pdf-file";
        const label = document.createElement("strong");
        label.textContent = file.title;
        row.append(label);
        const link = document.createElement("a");
        link.href = file.url;
        link.download = file.filename;
        link.className = "pdf-download";
        link.textContent = I18n.t("Télécharger le PDF");
        row.append(link);
        const open = document.createElement("a");
        open.href = file.url;
        open.target = "_blank";
        open.rel = "noopener";
        open.textContent = I18n.t("Ouvrir le PDF");
        row.append(open);
        links.append(row);
      }
      progress.textContent =
        files.length + I18n.t(" PDF prêt(s) à télécharger.");
    } catch (error) {
      release();
      if (!cancelled) {
        progress.textContent =
          I18n.t("Export interrompu : ") + (error.message || error);
      }
    } finally {
      generating = false;
      if (!cancelled) {
        generate.disabled = false;
        $$("#selection-pdf-form fieldset").forEach(
          (el) => (el.disabled = false),
        );
      }
    }
  };
}
// PDF files are generated locally from saved records; explicit links also suit iPad Safari.
async function exportBookPDF(notesOnly) {
  const book = C.clone(draft),
    palette = C.clone(state.palette),
    buttons = $$(".pdf-actions button");
  buttons.forEach((b) => (b.disabled = true));
  try {
    await ensureLibraryNameSaved();
    const exportLibraryName = state.libraryName || "";
    toast(I18n.t("Préparation du PDF…"));
    const bytes = await LibraryPDF.create(
      book,
      palette,
      notesOnly,
      exportLibraryName,
      enumLabel,
    );
    const name = pdfFilename(book, notesOnly, exportLibraryName);
    const url = URL.createObjectURL(
      new Blob([bytes], { type: "application/pdf" }),
    );
    const dialog = modal(
      I18n.t("PDF prêt"),
      "<p>" +
        C.esc(book.title) +
        (notesOnly
          ? I18n.t(" : notes et images jointes.")
          : I18n.t(" : fiche complète, notes et images.")) +
        '</p><a class="pdf-download" href="' +
        url +
        '" download="' +
        C.esc(name) +
        I18n.html('">Télécharger le PDF</a><p class="hint"><a href="') +
        url +
        I18n.html(
          '" target="_blank" rel="noopener">Ouvrir le PDF</a> permet aussi de le consulter et de l’enregistrer.</p>',
        ),
    );
    dialog.addEventListener(
      "close",
      () => setTimeout(() => URL.revokeObjectURL(url), 60000),
      { once: true },
    );
  } catch (e) {
    fail(e);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}
function field(id, label, value, type = "text", full = false, extra = "") {
  return (
    '<div class="' +
    (full ? "full" : "") +
    '"><label for="f-' +
    id +
    '">' +
    label +
    '</label><input id="f-' +
    id +
    '" name="' +
    id +
    '" type="' +
    type +
    '" value="' +
    C.esc(value) +
    '" ' +
    extra +
    "></div>"
  );
}
function renderEditor() {
  $("#drawer-label").textContent = selection
    ? I18n.t("Modifier la fiche")
    : I18n.t("Nouveau livre");
  renderFavorite();
  const cols = [
    ...new Set(
      active()
        .map((b) => b.collection)
        .filter(Boolean),
    ),
  ];
  const themes = [...new Set(active().flatMap((b) => b.themes))];
  $("#drawer-body").innerHTML =
    '<form id="book-form"><div class="form-grid">' +
    field(
      "title",
      I18n.t("Titre du livre *"),
      draft.title,
      "text",
      true,
      'required autocomplete="off"',
    ) +
    field(
      "number",
      I18n.t("N° et sous-titre"),
      draft.number,
      "text",
      false,
      'placeholder="' + I18n.t("Ex. : 1 · La sirène des Caraïbes") + '"',
    ) +
    field(
      "collection",
      "Collection",
      draft.collection,
      "text",
      false,
      'list="collection-list"',
    ) +
    '<datalist id="collection-list">' +
    cols.map((c) => '<option value="' + C.esc(c) + '">').join("") +
    "</datalist>" +
    field("author", I18n.t("Auteur(s)"), draft.author) +
    field("publisher", I18n.t("Éditeur"), draft.publisher) +
    field("shelf", I18n.t("Étagère"), draft.shelf) +
    field("bookType", I18n.t("Type de livre"), draft.bookType) +
    field("year", I18n.t("Année / édition"), draft.year) +
    field("isbn", "ISBN", draft.isbn) +
    field(
      "pages",
      I18n.t("Nombre de pages"),
      draft.pages,
      "number",
      false,
      'min="1" step="1" inputmode="numeric"',
    ) +
    field("language", I18n.t("Langue"), draft.language) +
    field("location", I18n.t("Emplacement"), draft.location) +
    field("loanName", I18n.t("Prêt à (nom)"), draft.loanName) +
    field("loanDate", I18n.t("Date de prêt"), draft.loanDate, "date") +
    I18n.html(
      '<div class="full"><button type="button" class="small" id="clear-loan-date">Effacer la date</button> <button type="button" class="small" id="return-loan">Livre rendu : retirer le prêt</button></div>',
    ) +
    I18n.html(
      '<div><label for="f-condition">État</label><select id="f-condition"><option value="">Non renseigné</option>',
    ) +
    C.CONDITIONS.map(
      (v) =>
        '<option value="' +
        C.esc(v) +
        '" ' +
        (draft.condition === v ? "selected" : "") +
        ">" +
        enumLabel(v) +
        "</option>",
    ).join("") +
    "</select></div>" +
    I18n.html(
      '<div><label for="f-status">Lecture</label><select id="f-status"><option value="">Non renseigné</option>',
    ) +
    C.STATUSES.map(
      (s) =>
        '<option value="' +
        C.esc(s) +
        '" ' +
        (draft.status === s ? "selected" : "") +
        ">" +
        enumLabel(s) +
        "</option>",
    ).join("") +
    I18n.html(
      '</select></div><div class="full"><label>Couleur(s)</label><div class="palette-picker" id="color-picker"></div></div>',
    ) +
    field(
      "themes",
      I18n.t("Domaines / thématiques, séparés par des virgules"),
      draft.themes.join(", "),
      "text",
      true,
      'list="theme-list"',
    ) +
    '<datalist id="theme-list">' +
    themes.map((t) => '<option value="' + C.esc(t) + '">').join("") +
    I18n.html(
      '</datalist></div><p class="hint">Les nouvelles images sont automatiquement allégées. La sauvegarde contient les copies optimisées, pas les originaux.</p><h3 class="section-label">Image de couverture</h3><div id="cover-editor"></div><h3 class="section-label">Mes notes</h3><div class="format-bar"><button type="button" data-format="bold"><strong>Gras</strong></button><button type="button" data-format="italic"><em>Italique</em></button><button type="button" data-format="heading">Titre</button><button type="button" data-format="list">Liste</button><label class="note-color-label">Couleur<input type="color" id="note-text-color" value="#004d65" aria-label="Couleur des caractères"></label><button type="button" id="apply-note-color">Colorer</button><label class="note-color-label">Surlignage<input type="color" id="note-highlight-color" value="#ffe58a" aria-label="Couleur du surlignage"></label><button type="button" id="apply-note-highlight">Surligner</button><button type="button" id="preview-notes" style="margin-left:auto">Aperçu</button></div><label for="f-notes" hidden>Mes notes</label><textarea class="notes-input" id="f-notes" placeholder="Une idée, une citation, un passage à retrouver…">',
    ) +
    C.esc(draft.notes) +
    I18n.html(
      '</textarea><div id="notes-preview" class="notes" style="padding:18px;border:1px solid var(--line)" hidden></div><p class="hint">La sélection du texte puis « Colorer » ou « Surligner » applique la couleur choisie. « Aperçu » montre le résultat.</p><h3 class="section-label">Images jointes</h3><button type="button" class="upload-area" style="width:100%" id="add-images">',
    ) +
    icon("image") +
    I18n.html(
      'Ajouter des images</button><p class="hint">JPG, PNG, WebP ou GIF, jusqu’à 15 Mo par image. Optimisation automatique : couvertures jusqu’à 600 px de haut, notes jusqu’à 1 600 px sur le grand côté, sans agrandissement. Les copies optimisées remplacent les originaux dans la sauvegarde. Les animations sont conservées.</p><div class="attachment-list" id="attachments"></div></form>',
    );
  $("#drawer-footer").innerHTML =
    I18n.html(
      '<div><button class="subtle" id="cancel-edit">Annuler</button></div><div><small class="muted" id="edit-state">',
    ) +
    (dirty ? I18n.t("Modifications à enregistrer") : "") +
    '</small><button class="primary" type="submit" form="book-form" id="save-book">' +
    icon("check") +
    I18n.html("Enregistrer la fiche</button></div>");
  $("#clear-loan-date").onclick = () => clearLoanFields(false);
  $("#return-loan").onclick = () => clearLoanFields(true);
  $("#apply-note-color").onclick = () =>
    colorNote("color", $("#note-text-color").value);
  $("#apply-note-highlight").onclick = () =>
    colorNote("highlight", $("#note-highlight-color").value);
  renderPalettePicker();
  renderAttachments();
  $("#book-form").oninput = () => markDirty();
  $("#book-form").onsubmit = async (e) => {
    e.preventDefault();
    await saveBook();
  };
  $("#cancel-edit").onclick = () => {
    if (dirty && !confirm(I18n.t("Annuler les modifications de cette fiche ?")))
      return;
    if (!selection) {
      closeDrawer(true);
      return;
    }
    draft = C.clone(state.books.find((b) => b.id === selection));
    dirty = false;
    editing = false;
    renderDetail();
  };
  $("#add-images").onclick = () => $("#image-files").click();
  $$("[data-format]").forEach(
    (el) => (el.onclick = () => formatNote(el.dataset.format)),
  );
  $("#preview-notes").onclick = () => {
    const preview = $("#notes-preview"),
      show = preview.hidden;
    preview.hidden = !show;
    $("#f-notes").hidden = show;
    $("#preview-notes").textContent = show
      ? I18n.t("Écrire")
      : I18n.t("Aperçu");
    if (show) {
      draft.notes = $("#f-notes").value;
      preview.innerHTML = C.renderNotes(draft.notes, draft.images);
      bindImages(preview, draft);
    }
  };
}
function clearLoanFields(returned) {
  const oldDate = $("#f-loanDate");
  oldDate.blur();
  const emptyDate = oldDate.cloneNode(false);
  emptyDate.removeAttribute("value");
  emptyDate.defaultValue = "";
  emptyDate.value = "";
  oldDate.replaceWith(emptyDate);
  draft.loanDate = "";
  if (returned) {
    $("#f-loanName").value = "";
    draft.loanName = "";
  }
  markDirty();
}
// In the saved record, returning a book is an explicit persisted action.
async function returnSavedBook() {
  if (!draft || editing || busy) return;
  const id = draft.id;
  try {
    await ensureLibraryNameSaved();
    const next = C.clone(state);
    const book = next.books.find((b) => b.id === id);
    if (!book) return;
    book.loanName = "";
    book.loanDate = "";
    book.updatedAt = new Date().toISOString();
    await commit(C.validate(next));
    if (draft?.id === id && !editing) {
      draft = C.clone(state.books.find((b) => b.id === id));
      renderDetail();
    }
    render();
    toast(
      I18n.t("Retour enregistré : le nom et la date de prêt ont été retirés."),
    );
  } catch (error) {
    fail(error);
  }
}
function markDirty() {
  dirty = true;
  if ($("#edit-state"))
    $("#edit-state").textContent = I18n.t("Modifications à enregistrer");
}
function readForm() {
  for (const k of [
    "title",
    "number",
    "collection",
    "author",
    "publisher",
    "year",
    "isbn",
    "location",
    "shelf",
    "bookType",
    "loanName",
    "loanDate",
    "condition",
    "pages",
    "language",
    "status",
    "notes",
  ])
    draft[k] = $("#f-" + k).value;
  if (!draft.title.trim()) throw Error(I18n.t("Indiquez le titre du livre."));
  draft.title = draft.title.trim();
  draft.themes = C.split($("#f-themes").value);
}
function renderPalettePicker() {
  $("#color-picker").innerHTML = state.palette
    .map(
      (c) =>
        '<button type="button" class="palette-chip ' +
        (draft.colors.includes(c.id) ? "active" : "") +
        '" aria-pressed="' +
        draft.colors.includes(c.id) +
        '" data-color="' +
        C.esc(c.id) +
        '"><span class="swatch" style="background:' +
        c.hex +
        '"></span>' +
        C.esc(c.name) +
        "</button>",
    )
    .join("");
  $$("[data-color]").forEach(
    (el) =>
      (el.onclick = () => {
        const id = el.dataset.color;
        draft.colors = draft.colors.includes(id)
          ? draft.colors.filter((x) => x !== id)
          : [...draft.colors, id];
        markDirty();
        renderPalettePicker();
      }),
  );
}
function renderCoverEditor() {
  const cover = draft.images.find((im) => im.role === "cover");
  $("#cover-editor").className = "cover-editor";
  $("#cover-editor").innerHTML =
    (cover
      ? '<button type="button" class="cover-preview subtle" data-image="' +
        C.esc(cover.id) +
        '"><img src="' +
        cover.data +
        I18n.html('" alt="Image de couverture"></button>')
      : '<div class="cover-placeholder">' + icon("image") + "</div>") +
    '<div class="cover-actions"><button type="button" id="choose-cover">' +
    icon("image") +
    (cover
      ? I18n.t("Changer l’image de couverture")
      : I18n.t("Choisir une image de couverture")) +
    "</button>" +
    (draft.images.length
      ? I18n.html(
          '<label for="existing-cover">Ou choisir parmi les images de la fiche</label><select id="existing-cover"><option value="">Aucune couverture</option>',
        ) +
        draft.images
          .map(
            (im) =>
              '<option value="' +
              C.esc(im.id) +
              '" ' +
              (im.role === "cover" ? "selected" : "") +
              ">" +
              C.esc(im.caption || im.name) +
              "</option>",
          )
          .join("") +
        "</select>"
      : "") +
    I18n.html(
      '<p class="hint">Cette image apparaît dans la vue Couvertures. Enregistrer la fiche conserve ce choix.</p></div>',
    );
  if (cover)
    $("#cover-editor").insertAdjacentHTML(
      "beforeend",
      '<small class="muted">' + C.esc(imageWeightLabel(cover)) + "</small>",
    );
  $("#choose-cover").onclick = () => $("#cover-file").click();
  if ($("#existing-cover"))
    $("#existing-cover").onchange = (e) => {
      draft.images.forEach(
        (im) => (im.role = im.id === e.target.value ? "cover" : "note"),
      );
      markDirty();
      renderAttachments();
    };
  bindImages($("#cover-editor"), draft);
}
function renderAttachments() {
  renderCoverEditor();
  $("#attachments").innerHTML = draft.images
    .map(
      (im, i) =>
        '<div class="attachment"><button type="button" class="subtle" style="padding:0" data-image="' +
        C.esc(im.id) +
        '"><img src="' +
        im.data +
        '" alt="' +
        C.esc(im.caption || im.name) +
        '"></button><div><small>' +
        C.esc(im.name) +
        " · " +
        C.esc(imageWeightLabel(im)) +
        (im.role === "cover" ? I18n.t(" · Couverture") : "") +
        '</small><input data-caption="' +
        i +
        '" value="' +
        C.esc(im.caption || "") +
        I18n.html(
          '" placeholder="Légende de l’image" aria-label="Légende de ',
        ) +
        C.esc(im.name) +
        '"><div class="actions"><button class="small" type="button" data-insert-image="' +
        i +
        I18n.html(
          '">Dans les notes</button><button class="small" type="button" data-cover="',
        ) +
        i +
        '">' +
        (im.role === "cover"
          ? I18n.t("Retirer couverture")
          : I18n.t("Couverture")) +
        '</button><button class="small subtle danger" type="button" data-delete-image="' +
        i +
        I18n.html('" aria-label="Supprimer l’image">') +
        icon("trash") +
        "</button></div></div></div>",
    )
    .join("");
  bindImages($("#attachments"), draft);
  $$("[data-caption]").forEach(
    (el) =>
      (el.oninput = () => {
        draft.images[Number(el.dataset.caption)].caption = el.value;
        markDirty();
      }),
  );
  $$("[data-insert-image]").forEach(
    (el) =>
      (el.onclick = () => {
        const im = draft.images[Number(el.dataset.insertImage)];
        insertNote(
          "\n\n![" +
            (im.caption || im.name).replace(/[\[\]]/g, "") +
            "](attachment:" +
            im.id +
            ")\n\n",
        );
      }),
  );
  $$("[data-cover]").forEach(
    (el) =>
      (el.onclick = () => {
        const im = draft.images[Number(el.dataset.cover)],
          was = im.role === "cover";
        draft.images.forEach((x) => (x.role = "note"));
        if (!was) im.role = "cover";
        markDirty();
        renderAttachments();
      }),
  );
  $$("[data-delete-image]").forEach(
    (el) =>
      (el.onclick = () => {
        const i = Number(el.dataset.deleteImage),
          im = draft.images[i];
        if (
          !confirm(
            I18n.t("Supprimer cette image de la fiche et de ses notes ?"),
          )
        )
          return;
        const input = $("#f-notes");
        input.value = input.value.replace(
          new RegExp(
            "!\\[[^\\]]*\\]\\(attachment:" +
              im.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
              "\\)",
            "g",
          ),
          "",
        );
        draft.images.splice(i, 1);
        markDirty();
        renderAttachments();
      }),
  );
}
function insertNote(text) {
  const el = $("#f-notes");
  el.hidden = false;
  $("#notes-preview").hidden = true;
  $("#preview-notes").textContent = I18n.t("Aperçu");
  const p = el.selectionStart;
  el.setRangeText(text, p, el.selectionEnd, "end");
  el.focus();
  markDirty();
}
function colorNote(kind, hex) {
  const el = $("#f-notes"),
    text = el.value.slice(el.selectionStart, el.selectionEnd);
  if (!text) {
    toast(
      I18n.t("La sélection de texte indique le passage à mettre en couleur."),
    );
    el.focus();
    return;
  }
  insertNote(
    text
      .split("\n")
      .map((line) =>
        line ? "[" + kind + "=" + hex + "]" + line + "[/" + kind + "]" : line,
      )
      .join("\n"),
  );
}
function formatNote(type) {
  const el = $("#f-notes"),
    t =
      el.value.slice(el.selectionStart, el.selectionEnd) ||
      I18n.t("votre texte");
  const v = {
    bold: "**" + t + "**",
    italic: "*" + t + "*",
    heading: "\n### " + t + "\n",
    list:
      "\n" +
      t
        .split("\n")
        .map((x) => "- " + x)
        .join("\n") +
      "\n",
  }[type];
  insertNote(v);
}
function imageWeight(bytes) {
  return (
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
      bytes / (bytes >= 1048576 ? 1048576 : 1024),
    ) + (bytes >= 1048576 ? I18n.t(" Mo") : I18n.t(" Ko"))
  );
}
function imageWeightLabel(image) {
  const current = ImageOptimizer.bytes(image.data);
  return image.optimization
    ? imageWeight(image.optimization.sourceBytes) +
        " → " +
        imageWeight(current) +
        " · " +
        I18n.t("Copie optimisée")
    : imageWeight(current);
}
let imagesProcessing = false;
async function optimizeLibraryImages() {
  if (!state || busy || imagesProcessing) return;
  try {
    await ensureLibraryNameSaved();
  } catch (error) {
    fail(error);
    return;
  }
  const snapshot = state,
    revision = state.revision;
  const total = snapshot.books.reduce((n, b) => n + b.images.length, 0);
  let cancelled = false,
    proposed = null;
  const dialog = modal(
    I18n.t("Alléger les images"),
    I18n.html(
      '<p>Les couvertures sont réduites à 600 px de haut, les images de notes à 1 600 px sur le grand côté. Les petites images ne sont jamais agrandies. Les animations sont conservées.</p><p class="notice">Les images optimisées remplacent les originaux dans la bibliothèque et les prochaines sauvegardes JSON. Conservez une sauvegarde avant de les remplacer. Cette opération efface l’historique Annuler/Rétablir et la copie précédant le dernier import.</p><p id="optimization-progress" role="status"></p><div id="optimization-report"></div>',
    ),
    I18n.html(
      '<button id="optimization-cancel">Annuler</button><button class="primary" id="optimization-start">Calculer le gain</button><button class="primary" id="optimization-apply" hidden>Remplacer les images</button>',
    ),
  );
  $("#optimization-progress").textContent =
    total + I18n.t(" image(s) dans la bibliothèque, corbeille comprise.");
  $("#optimization-start").disabled = !total;
  const cancel = () => {
    cancelled = true;
    proposed = null;
    dialog.close();
  };
  $("#optimization-cancel").onclick = cancel;
  dialog.addEventListener(
    "close",
    () => {
      cancelled = true;
      proposed = null;
    },
    { once: true },
  );
  $("#optimization-start").onclick = async () => {
    const start = $("#optimization-start"),
      apply = $("#optimization-apply");
    start.disabled = true;
    imagesProcessing = true;
    let before = 0,
      after = 0,
      count = 0,
      changed = 0,
      kept = 0,
      jsonGain = 0;
    const failures = [],
      books = [];
    try {
      for (const book of snapshot.books) {
        const images = [];
        for (const original of book.images) {
          if (cancelled) return;
          let result;
          try {
            result = await ImageOptimizer.optimize(original);
          } catch (error) {
            result = {
              image: original,
              before: ImageOptimizer.bytes(original.data),
              after: ImageOptimizer.bytes(original.data),
              changed: false,
            };
            failures.push(book.title + " : " + original.name);
          }
          if (cancelled) return;
          images.push(result.image);
          before += result.before;
          after += result.after;
          count++;
          if (result.changed) {
            changed++;
            jsonGain +=
              new Blob([JSON.stringify(original)]).size -
              new Blob([JSON.stringify(result.image)]).size;
          } else kept++;
          $("#optimization-progress").textContent = count + " / " + total;
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        books.push({ ...book, images });
      }
      proposed = { ...snapshot, books };
      $("#optimization-report").innerHTML =
        "<p><strong>" +
        imageWeight(before) +
        " → " +
        imageWeight(after) +
        "</strong></p><p>" +
        changed +
        I18n.t(" image(s) optimisée(s), ") +
        kept +
        I18n.t(" conservée(s).") +
        "</p><p>" +
        I18n.t("Allègement estimé du JSON : ") +
        imageWeight(Math.max(0, jsonGain)) +
        "</p>" +
        (failures.length
          ? "<p>" +
            I18n.t("Images illisibles conservées : ") +
            "</p><ul>" +
            failures.map((x) => "<li>" + C.esc(x) + "</li>").join("") +
            "</ul>"
          : "");
      start.hidden = true;
      apply.hidden = false;
      apply.disabled = !changed;
    } catch (error) {
      if (!cancelled) {
        fail(error);
        start.disabled = false;
      }
    } finally {
      imagesProcessing = false;
    }
  };
  $("#optimization-apply").onclick = async () => {
    if (!proposed) return;
    const button = $("#optimization-apply");
    button.disabled = true;
    try {
      await ensureLibraryNameSaved();
      if (state !== snapshot || state.revision !== revision)
        throw Error(
          I18n.t(
            "La bibliothèque a changé. Relancez le calcul avant de remplacer les images.",
          ),
        );
      // Do not keep a hidden full-size duplicate in undo or the pre-import snapshot.
      await commit(proposed, { history: false, purgeTrash: true });
      undoHistory.length = 0;
      redoHistory.length = 0;
      updateHistoryButtons();
      dialog.close();
      render();
      toast(
        I18n.t(
          "Images allégées. La prochaine sauvegarde JSON utilisera ces copies.",
        ),
      );
    } catch (error) {
      fail(error);
      button.disabled = false;
    }
  };
}

async function addImages(files, role = "note") {
  if (!files.length || !draft || !editing || imagesProcessing) return;
  imagesProcessing = true;
  const targetId = draft?.id;
  try {
    const added = [];
    let before = 0,
      after = 0;
    $("#save-book").disabled = true;
    for (const file of files) {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type))
        throw Error(
          I18n.t("Format non reconnu pour ") +
            file.name +
            I18n.t(". Utilisez JPG, PNG, WebP ou GIF."),
        );
      if (file.size > 15 * 1024 * 1024)
        throw Error(file.name + I18n.t(" dépasse 15 Mo."));
      const data = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () =>
          rej(Error(I18n.t("Lecture impossible : ") + file.name));
        r.readAsDataURL(file);
      });
      const result = await ImageOptimizer.optimize({
        id: "img_" + crypto.randomUUID(),
        name: file.name,
        data,
        caption: "",
        role,
      });
      added.push(result.image);
      before += result.before;
      after += result.after;
      if (!draft || !editing || draft.id !== targetId) return;
      toast(
        I18n.t("Optimisation des images… ") +
          added.length +
          " / " +
          files.length,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (!draft || !editing || draft.id !== targetId) return;
    if (role === "cover")
      draft.images.forEach((im) => {
        if (im.role === "cover") im.role = "note";
      });
    draft.images.push(...added);
    markDirty();
    renderAttachments();
    toast(
      plural(added.length, I18n.t("image ajoutée"), I18n.t("images ajoutées")) +
        " · " +
        imageWeight(before) +
        " → " +
        imageWeight(after),
    );
  } catch (e) {
    fail(e);
  } finally {
    imagesProcessing = false;
    if ($("#save-book")) $("#save-book").disabled = false;
    $("#image-files").value = "";
    $("#cover-file").value = "";
  }
}
async function saveBook() {
  if (imagesProcessing) {
    toast(I18n.t("Les images sont en cours de traitement."));
    return;
  }
  try {
    await ensureLibraryNameSaved();
    readForm();
    const next = C.clone(state);
    draft.updatedAt = new Date().toISOString();
    const i = next.books.findIndex((b) => b.id === draft.id);
    if (i < 0) next.books.push(C.clone(draft));
    else next.books[i] = C.clone(draft);
    C.validate(next);
    $("#save-book").disabled = true;
    await commit(next);
    selection = draft.id;
    dirty = false;
    editing = false;
    render();
    renderDetail();
    toast(
      volatile
        ? I18n.t("Fiche gardée en mémoire. Pensez à Sauvegarder.")
        : I18n.t("Fiche enregistrée."),
    );
  } catch (e) {
    fail(e);
    if ($("#save-book")) $("#save-book").disabled = false;
    if (!$("#rescue-book")) {
      $("#drawer-footer").insertAdjacentHTML(
        "afterbegin",
        I18n.html(
          '<button class="small" id="rescue-book">Télécharger cette fiche</button>',
        ),
      );
      $("#rescue-book").onclick = async () => {
        try {
          await ensureLibraryNameSaved();
          readForm();
          const data = C.validate({
            format: C.FORMAT,
            schemaVersion: 1,
            libraryName: state.libraryName || "",
            books: [draft],
            palette: state.palette,
          });
          download(
            new Blob([JSON.stringify(data, null, 2)], {
              type: "application/json",
            }),
            backupBaseName() + "_fiche_" + stamp() + ".json",
          );
          toast(I18n.t("Fiche exportée. Vous pourrez la réimporter."));
        } catch (err) {
          fail(err);
        }
      };
    }
  }
}
async function toggleFavorite() {
  if (!draft) return;
  draft.favorite = !draft.favorite;
  if (editing) {
    markDirty();
    renderFavorite();
    return;
  }
  try {
    const next = C.clone(state);
    next.books.find((b) => b.id === draft.id).favorite = draft.favorite;
    await commit(next);
    renderFavorite();
    render();
  } catch (e) {
    draft.favorite = !draft.favorite;
    fail(e);
  }
}
async function removeBook() {
  try {
    const next = C.clone(state),
      b = next.books.find((x) => x.id === draft.id);
    if (b.deletedAt) delete b.deletedAt;
    else {
      if (
        !confirm(
          I18n.t("Déplacer « ") + b.title + I18n.t(" » dans la corbeille ?"),
        )
      )
        return;
      b.deletedAt = new Date().toISOString();
    }
    await commit(next);
    closeDrawer(true);
    render();
    toast(
      b.deletedAt
        ? I18n.t("Livre déplacé dans la corbeille.")
        : I18n.t("Livre restauré."),
    );
  } catch (e) {
    fail(e);
  }
}
function showImage(b, id) {
  const im = b.images.find((i) => i.id === id);
  if (!im) return;
  const d = $("#lightbox");
  d.innerHTML =
    '<div class="dialog-head"><h2>' +
    C.esc(im.caption || im.name) +
    '</h2><div class="actions"><button id="download-image" class="small">' +
    icon("download") +
    I18n.html(
      'Télécharger l’image</button><button class="icon" id="close-image" aria-label="Fermer">',
    ) +
    icon("close") +
    '</button></div></div><img src="' +
    im.data +
    '" alt="' +
    C.esc(im.caption || im.name) +
    '">';
  d.showModal();
  $("#close-image").onclick = () => d.close();
  $("#download-image").onclick = async () => {
    try {
      await ensureLibraryNameSaved();
      download(im.data, (librarySlug() ? librarySlug() + "_" : "") + im.name);
    } catch (error) {
      fail(error);
    }
  };
}
// Portable backups include the current image copies. Import previews precede every write.
function download(blob, name) {
  const url = typeof blob === "string" ? blob : URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  if (typeof blob !== "string")
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function backup() {
  try {
    await ensureLibraryNameSaved();
    const now = new Date().toISOString();
    const data = {
      ...C.clone(state),
      format: C.FORMAT,
      schemaVersion: 1,
      exportScope: { kind: "library" },
      exportedAt: now,
      lastBackup: now,
    };
    delete data.revision;
    download(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      backupBaseName() + ".json",
    );
    const next = C.clone(state);
    next.lastBackup = now;
    await commit(next);
    toast(I18n.t("Sauvegarde préparée : conservez le fichier téléchargé."));
  } catch (e) {
    fail(e);
  }
}
async function backupCollection() {
  try {
    await ensureLibraryNameSaved();
    if (!scope.startsWith("collection:")) return;
    const name = scope.slice(11),
      data = C.collectionBackup(state, name),
      slug =
        C.norm(name)
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "collection";
    download(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      backupBaseName() + "_" + slug + ".json",
    );
    toast(
      I18n.t("Sauvegarde de « ") +
        name +
        I18n.t(" » préparée, avec ses notes et ses images."),
    );
  } catch (e) {
    fail(e);
  }
}
function importDialog() {
  modal(
    I18n.t("Importer une bibliothèque"),
    I18n.html(
      '<p style="font-size:13px;line-height:1.8">Importer une sauvegarde JSON de Bibliothèque. Un aperçu permet de vérifier son contenu avant de l’ajouter.</p><p class="hint">Les livres, notes, images, collections et repères couleur sont conservés.</p><button class="upload-area" id="choose-import" style="width:100%">',
    ) +
      icon("download") +
      I18n.html("Choisir un fichier JSON</button>"),
    I18n.html(
      '<button class="subtle" id="undo-import">Annuler le dernier import</button>',
    ),
  );
  $("#choose-import").onclick = () => $("#import-file").click();
  $("#undo-import").onclick = undoImport;
}
async function readImport(file) {
  if (!file) return;
  try {
    if (file.size > 150 * 1024 * 1024)
      throw Error(
        I18n.t("Ce fichier dépasse la limite de 150 Mo de cette version."),
      );
    modal(
      I18n.t("Lecture du fichier…"),
      I18n.html("<p>Vérification des fiches et des images.</p>"),
    );
    if (!/\.json$/i.test(file.name))
      throw Error(I18n.t("Choisissez un fichier JSON Bibliothèque."));
    // Legacy files without a palette retain the device's existing definitions.
    incoming = C.validate(JSON.parse(await file.text()), state.palette);
    incoming.libraryName = incoming.libraryName || "";
    const scoped = incoming.exportScope?.kind === "collection",
      name = scoped ? incoming.exportScope.name : "";
    const added =
      C.merge(state, incoming, "add").books.length - state.books.length;
    const nNotes = incoming.books.filter(hasNotes).length,
      nImages = incoming.books.reduce((n, b) => n + b.images.length, 0);
    const restore = scoped
      ? I18n.html(
          '<label class="import-choice"><input type="radio" name="import-mode" value="replace-collection"><span>Restaurer seulement « ',
        ) +
        C.esc(name) +
        I18n.html(
          " »<small>Le fichier remplace cette collection. Les autres collections sont conservées.</small></span></label>",
        )
      : I18n.html(
          '<label class="import-choice"><input type="radio" name="import-mode" value="replace"><span>Restaurer toute la sauvegarde<small>Le contenu exact du fichier remplace la bibliothèque actuelle.</small></span></label>',
        );
    modal(
      I18n.t("Vérifier l’import"),
      '<p style="font-size:12px;overflow-wrap:anywhere" class="muted">' +
        C.esc(file.name) +
        '</p><div class="notice">' +
        (scoped
          ? I18n.t("Collection « ") + C.esc(name) + I18n.html(" »<br>")
          : "") +
        "<strong>" +
        plural(incoming.books.length, I18n.t("fiche")) +
        "</strong> · " +
        plural(
          nNotes,
          I18n.t("fiche avec notes"),
          I18n.t("fiches avec notes"),
        ) +
        " · " +
        plural(nImages, "image") +
        "<br>" +
        added +
        I18n.t(" nouvelle(s) fiche(s), ") +
        (incoming.books.length - added) +
        I18n.html(" déjà présente(s).</div>") +
        I18n.html(
          '<label class="import-choice"><input type="radio" name="import-mode" value="add" checked><span>Ajouter les nouvelles fiches<small>Les fiches déjà présentes, leurs notes et leurs images sont conservées.</small></span></label>',
        ) +
        I18n.html(
          '<label class="import-choice"><input type="radio" name="import-mode" value="update"><span>Mettre à jour les fiches correspondantes<small>Le contenu du fichier remplace celui des fiches correspondantes, y compris les notes et images. Les autres livres restent présents.</small></span></label>',
        ) +
        restore +
        I18n.html(
          '<p class="hint">Les repères couleur du fichier sont rétablis dans toute la bibliothèque, y compris ceux déjà présents. Les retraits enregistrés dans le fichier sont aussi appliqués. Les autres repères propres à cet appareil sont conservés lors d’un ajout, d’une mise à jour ou de la restauration d’une collection.</p>',
        ) +
        I18n.html(
          '<p class="hint">Les exemplaires distincts de l’export sont conservés. ',
        ) +
        (db
          ? I18n.t(
              "La bibliothèque actuelle sera gardée pour permettre d’annuler cet import.",
            )
          : I18n.t(
              "Une sauvegarde préalable conserve la bibliothèque actuelle.",
            )) +
        "</p>",
      I18n.html(
        '<button id="cancel-import">Annuler</button><button id="confirm-import" class="primary">Importer</button>',
      ),
    );
    $("#cancel-import").onclick = () => $("#modal").close();
    $("#confirm-import").onclick = performImport;
  } catch (e) {
    modal(
      I18n.t("Import impossible"),
      "<p>" +
        C.esc(e.message || I18n.t("Fichier illisible.")) +
        I18n.html(
          '</p><p class="muted">Votre bibliothèque n’a pas été modifiée.</p>',
        ),
    );
  } finally {
    $("#import-file").value = "";
  }
}
async function performImport() {
  const mode = $('input[name="import-mode"]:checked').value;
  if (
    mode === "replace" &&
    !confirm(
      I18n.t("Remplacer toute la bibliothèque actuelle par les ") +
        incoming.books.length +
        I18n.t(" fiches de ce fichier ?"),
    )
  )
    return;
  if (
    mode === "replace-collection" &&
    !confirm(
      I18n.t("Restaurer la collection « ") +
        incoming.exportScope.name +
        I18n.t(
          " » depuis ce fichier ? Les autres collections seront conservées.",
        ),
    )
  )
    return;
  try {
    $("#confirm-import").disabled = true;
    const data = C.clone(incoming);
    await ensureLibraryNameSaved();
    const next = C.merge(state, C.validate(data), mode);
    await commit(next, { beforeImport: true, setLibraryName: true });
    scope =
      data.exportScope?.kind === "collection"
        ? "collection:" + data.exportScope.name
        : "all";
    page = 1;
    resetFilters(false);
    $("#search").value = "";
    $("#modal").close();
    render();
    toast(
      I18n.t("Import terminé. ") +
        active().length +
        I18n.t(" livres dans la bibliothèque."),
    );
    incoming = null;
  } catch (e) {
    fail(e);
    $("#confirm-import").disabled = false;
  }
}
async function undoImport() {
  try {
    if (!db)
      throw Error(
        I18n.t(
          "Annulation indisponible en mémoire temporaire. Réimportez votre sauvegarde.",
        ),
      );
    const prev = await load("before-import");
    if (!prev) throw Error(I18n.t("Aucun import à annuler sur cet appareil."));
    if (
      !confirm(
        I18n.t(
          "Revenir à la bibliothèque précédant le dernier import ? Les modifications faites depuis seront remplacées.",
        ),
      )
    )
      return;
    await ensureLibraryNameSaved();
    await commit(C.validate(prev), {
      beforeImport: true,
      setLibraryName: true,
    });
    scope = "all";
    page = 1;
    $("#modal").close();
    render();
    toast(I18n.t("Bibliothèque précédente restaurée."));
  } catch (e) {
    fail(e);
  }
}
function paletteDialog() {
  const palette = C.clone(state.palette),
    removed = new Set();
  const dialog = modal(
    I18n.t("Mes repères couleur"),
    I18n.html(
      '<p class="hint">Chaque repère possède un nom et une couleur modifiables. Ces réglages s’appliquent à toutes les fiches et sont inclus dans les sauvegardes JSON, y compris celles d’une collection.</p><p class="hint">La croix retire un repère. « Enregistrer » applique les changements ; « Annuler » les abandonne. Le retrait peut ensuite être annulé avec le bouton Annuler de la bibliothèque.</p><div id="palette-settings"></div><button id="add-color" class="small">',
    ) +
      icon("plus") +
      I18n.html("Nouveau repère</button>"),
    I18n.html(
      '<button id="cancel-palette">Annuler</button><button id="save-palette" class="primary">Enregistrer</button>',
    ),
  );
  function readFields() {
    // Read native picker values before rebuilding rows or saving, even if the
    // browser has not yet emitted an input event.
    $$("[data-palette-hex]").forEach((el) => {
      palette[Number(el.dataset.paletteHex)].hex = el.value;
    });
    $$("[data-palette-name]").forEach((el) => {
      palette[Number(el.dataset.paletteName)].name = el.value.trim();
    });
  }
  function drawRows() {
    $("#palette-settings").innerHTML = palette
      .map((p, i) => {
        const label = I18n.t("Retirer le repère") + " : " + p.name;
        return (
          '<div class="palette-row"><input type="color" data-palette-hex="' +
          i +
          '" value="' +
          p.hex +
          '" aria-label="' +
          I18n.t("Couleur du repère") +
          " " +
          (i + 1) +
          '"><input type="text" data-palette-name="' +
          i +
          '" value="' +
          C.esc(p.name) +
          '" aria-label="' +
          I18n.t("Nom du repère") +
          " " +
          (i + 1) +
          '"><button type="button" class="icon subtle danger" data-remove-palette="' +
          i +
          '" aria-label="' +
          C.esc(label) +
          '" title="' +
          C.esc(label) +
          '">' +
          icon("close") +
          "</button></div>"
        );
      })
      .join("");
    $$("[data-remove-palette]").forEach((button) => {
      button.onclick = () => {
        readFields();
        const i = Number(button.dataset.removePalette),
          entry = palette[i];
        const count = state.books.filter((b) =>
          b.colors.includes(entry.id),
        ).length;
        if (
          count &&
          !confirm(
            I18n.t("Retirer le repère « ") +
              entry.name +
              I18n.t(" » ? Il est utilisé par ") +
              count +
              I18n.t(
                " livre(s), corbeille comprise. À l’enregistrement, ce repère sera retiré de leurs fiches. Les livres, notes et images seront conservés.",
              ),
          )
        )
          return;
        removed.add(entry.id);
        palette.splice(i, 1);
        drawRows();
        (
          $("#palette-settings [data-remove-palette]") || $("#add-color")
        ).focus();
      };
    });
  }
  drawRows();
  $("#cancel-palette").onclick = () => dialog.close();
  $("#add-color").onclick = () => {
    readFields();
    palette.push({
      id: "color_" + crypto.randomUUID(),
      name: I18n.t("Nouveau repère"),
      hex: "#c47a2c",
    });
    drawRows();
    $(
      '#palette-settings [data-palette-name="' + (palette.length - 1) + '"]',
    ).focus();
  };
  $("#save-palette").onclick = async () => {
    const button = $("#save-palette");
    if (button.disabled) return;
    button.disabled = true;
    try {
      readFields();
      if (palette.some((p) => !p.name.trim()))
        throw Error(I18n.t("Donnez un nom à chaque repère."));
      await ensureLibraryNameSaved();
      // One history entry covers both the palette and its book assignments.
      // Tombstones keep intentionally removed labels out of future JSON imports.
      const removedPaletteIds = [
        ...new Set([...(state.removedPaletteIds || []), ...removed]),
      ];
      const next = C.validate({ ...state, palette, removedPaletteIds });
      await commit(next);
      dialog.close();
      render();
      toast(I18n.t("Repères enregistrés."));
    } catch (e) {
      fail(e);
      button.disabled = false;
    }
  };
}

function help() {
  modal(
    I18n.t("Votre bibliothèque, simplement"),
    I18n.html(
      '<p>Le champ « N° et sous-titre » accepte le numéro et le titre du tome dans une seule saisie. À titre identique, le tri alphabétique utilise le numéro du tome. Le tri par année place les années non renseignées à la fin.</p><p>Dans la sélection, « Exporter PDF » propose les fiches complètes ou les notes uniquement, réunies dans un PDF ou séparées en un PDF par livre. Chaque livre commence sur une nouvelle page. Les PDF séparés se téléchargent avec leur lien individuel.</p><p>Le nom de la bibliothèque est enregistré dès la saisie. Il reste présent après les autres enregistrements et Annuler/Rétablir.</p><div class="help-step"><span>1</span><div><h3>La recherche retrouve les livres</h3><p>La recherche retrouve un titre, un numéro ou un mot dans les notes. Les filtres combinent collection, auteur, éditeur, langue, état, lecture, emplacement, étagère, type, année, prêt, favoris, nombre de pages et dates de prêt, en plus des thématiques et couleurs. Un appui sur un titre ouvre sa fiche. Dans une collection, les compteurs « annotés » et « images » filtrent uniquement cette collection. Un second appui retire ce filtre. Le compteur « avec images » indique le nombre de livres contenant des images dans leurs notes. Chaque livre compte une fois, quel que soit le nombre d’images. Les couvertures sont exclues.</p></div></div><div class="help-step"><span>2</span><div><h3>Les fiches accueillent notes et images</h3><p>« Ajouter un livre » crée une fiche. « Dupliquer » ouvre une copie indépendante, avec ses champs, notes et images, à modifier avant de l’enregistrer. « Modifier » permet d’ajouter vos notes et vos images. « Enregistrer la fiche » conserve les modifications. Les boutons « PDF de la fiche complète » et « PDF des notes » téléchargent le contenu enregistré de la fiche. Le PDF des notes comprend leurs images, sans couverture ni propriétés. Le nombre de pages et la langue complètent la fiche. Dans les notes, la sélection d’un passage puis « Colorer » ou « Surligner » applique la couleur choisie ; « Aperçu » affiche le résultat. Une image peut servir de couverture ou être insérée dans vos notes. Les champs « Prêt à (nom) » et « Date de prêt » conservent le nom de la personne et la date. Effacer ces deux champs marque le retour du livre.</p></div></div><div class="help-step"><span>3</span><div><h3>La sauvegarde emporte les données</h3><p>Le bouton « Sauvegarder » télécharge un fichier complet, avec les livres, les notes, les images et les repères couleur. Le fichier se conserve dans Fichiers sur l’iPad ou dans un dossier de ton choix. Le bouton « Sauvegarder la collection », près du titre, exporte uniquement la collection affichée, avec ses images. Sa restauration conserve les autres collections.</p></div></div><div class="help-step"><span>4</span><div><h3>L’import restaure les données</h3><p>Sur un autre appareil, « Importer » ouvre une sauvegarde .bibliotheque.json. La restauration proposée rétablit la bibliothèque ou la collection contenue dans ce fichier. Seules les sauvegardes JSON Bibliothèque sont importées.</p></div></div><div class="help-step"><span>5</span><div><h3>La sélection permet les modifications groupées</h3><p>« Sélectionner » affiche les cases dans les vues tableau et couvertures. Dans ce mode, un appui sélectionne le livre sans ouvrir sa fiche. Dans la vue couvertures, un glissement sélectionne une plage de livres ; partir d’un livre déjà sélectionné désélectionne la plage. Le bord de l’écran fait défiler la page pendant le geste. Les espaces entre les cartes permettent le défilement habituel. « Tous les résultats » sélectionne les livres correspondant aux filtres, sur toutes les pages. « Dupliquer » crée une copie de chaque fiche sélectionnée et sélectionne les copies. « Annuler » revient en une action à la situation précédente. « Modifier la sélection » ouvre une fenêtre où seuls les champs cochés sont remplacés. Une valeur vide efface le champ choisi. Le prêt se modifie aussi en groupe. Les titres, numéros, ISBN, couvertures, notes et images jointes restent inchangés.</p></div></div><div class="notice"><strong>À retenir :</strong> les fiches enregistrées sont conservées dans ce navigateur. Les appareils ne se synchronisent pas automatiquement. Une sauvegarde téléchargée protège vos données si le navigateur est effacé.</div><p class="hint">L’application démarre vide. Une collection nommée « Que sais-je ? » affiche une bande blanche verticale centrale ; « Penguin » affiche une bande blanche horizontale centrale. Une image de couverture fournie remplace ces couvertures automatiques. Les exemplaires distincts et les propriétés d’origine sont conservés. Les réglages « Couleur d’accent », « Couleur de fond » et « Couleur des filtres » se trouvent dans le panneau gauche. Leur aperçu change immédiatement. « Appliquer » enregistre le choix, « Annuler » revient au dernier choix enregistré et « Réinitialiser les couleurs » rétablit les valeurs par défaut. Ils sont enregistrés sur cet appareil et inclus dans la sauvegarde complète. La sauvegarde d’une collection conserve les couleurs de l’interface actuelle lors de sa restauration.</p><p class="hint">Bibliothèque 1.3.2 · 29-10-2026 · Eigrutel Lab<br>Programme conçu et développé par Simon Léturgie dans le cadre d’Eigrutel BD Academy.<br>Code GNU AGPL v3.0+ · Documentation et modèles CC BY-SA 4.0. Marques Eigrutel réservées.</p>',
    ),
  );
}
// Event wiring: keyboard shortcuts, responsive navigation and form controls.
function switchLanguage() {
  if (!state || $("#modal").open || $("#lightbox").open) return;
  const focusedId = document.activeElement?.id;
  const scrollTop = $("#drawer-body").scrollTop;
  const notePreview = $("#notes-preview") && !$("#notes-preview").hidden;
  // Preserve unsaved input values; translation never validates or saves a draft.
  const fields = $$(
    "#drawer input,#drawer textarea,#drawer select,.appearance-settings input",
  )
    .filter((node) => node.id && node.type !== "file")
    .map((node) => ({
      id: node.id,
      value: node.value,
      checked: node.checked,
      start: node.selectionStart,
      end: node.selectionEnd,
    }));
  I18n.setLanguage(I18n.language === "fr" ? "en" : "fr");
  locale = I18n.locale;
  render();
  syncSidebar();
  storageStatus();
  document.title =
    (state.libraryName ? state.libraryName + " · " : "") +
    I18n.t("Bibliothèque");
  if (draft && !$("#drawer").hidden) {
    if (editing) renderEditor();
    else renderDetail();
  }
  for (const field of fields) {
    const node = document.getElementById(field.id);
    if (!node) continue;
    node.value = field.value;
    node.checked = field.checked;
    if (field.start != null && node.setSelectionRange) {
      try {
        node.setSelectionRange(field.start, field.end);
      } catch {}
    }
  }
  if (editing && notePreview) {
    $("#notes-preview").hidden = false;
    $("#f-notes").hidden = true;
    $("#notes-preview").innerHTML = C.renderNotes(
      $("#f-notes").value,
      draft.images,
    );
    bindImages($("#notes-preview"), draft);
    $("#preview-notes").textContent = I18n.t("Écrire");
  }
  document.getElementById(focusedId)?.focus({ preventScroll: true });
  $("#drawer-body").scrollTop = scrollTop;
  $("#toast").hidden = true;
}
$("#language-switch").onclick = switchLanguage;
function previewAppearance(key, value) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return;
  appearanceDraft = {
    ...appearanceValues(appearanceDraft || state.appearance),
    [key]: value,
  };
  applyAppearance(appearanceDraft, false);
}
for (const key of ["accent", "background", "filters"]) {
  const picker = $("#appearance-" + key),
    hex = $("#appearance-" + key + "-hex");
  picker.oninput = picker.onchange = (e) => {
    hex.value = e.target.value;
    previewAppearance(key, e.target.value);
  };
  hex.oninput = (e) => {
    const value = e.target.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      picker.value = value;
      previewAppearance(key, value);
    }
  };
}
$("#cancel-appearance").onclick = () => {
  appearanceDraft = null;
  applyAppearance();
};
$("#apply-appearance").onclick = async () => {
  const appearance = {
    accent: $("#appearance-accent-hex").value.trim(),
    background: $("#appearance-background-hex").value.trim(),
    filters: $("#appearance-filters-hex").value.trim(),
  };
  if (Object.values(appearance).some((v) => !/^#[0-9a-f]{6}$/i.test(v))) {
    toast(
      I18n.t(
        "Chaque couleur utilise un code de six chiffres, par exemple #1F3A44.",
      ),
      true,
    );
    return;
  }
  try {
    await commit({ ...state, appearance });
    appearanceDraft = null;
    applyAppearance();
    toast(I18n.t("Couleurs enregistrées."));
  } catch (e) {
    fail(e);
  }
};
$("#reset-appearance").onclick = async () => {
  try {
    await commit({ ...state, appearance: { ...appearanceDefaults } });
    appearanceDraft = null;
    applyAppearance();
    toast(I18n.t("Couleurs par défaut rétablies."));
  } catch (e) {
    fail(e);
  }
};
$("#library-name").oninput = (e) => {
  rememberNameDraft(e.target.value);
  clearTimeout(nameSaveTimer);
  nameSaveTimer = setTimeout(
    () => saveLibraryName($("#library-name").value).catch(fail),
    250,
  );
};
window.addEventListener("pagehide", () => {
  if (pendingLibraryName !== null)
    saveLibraryName(pendingLibraryName).catch(() => {});
});
$("#library-name").onchange = async (e) => {
  try {
    await saveLibraryName(e.target.value);
    toast(I18n.t("Nom de la bibliothèque enregistré."));
  } catch (error) {
    fail(error);
  }
};
$("#library-name").onkeydown = (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    e.target.blur();
  }
};
$("#bulk-bar").addEventListener("click", (e) => {
  if (e.target.closest("#empty-trash")) emptyTrash();
});
$("#empty-trash-top").onclick = () => emptyTrash();
$("#add-btn").onclick = newBook;
$("#undo-btn").onclick = undoChange;
$("#redo-btn").onclick = redoChange;
$("#close-drawer").onclick = () => closeDrawer();
$("#drawer-shade").onclick = () => closeDrawer();
$("#favorite-btn").onclick = toggleFavorite;
$("#search").oninput = () => {
  page = 1;
  renderList();
};
$("#clear-search").onclick = () => {
  $("#search").value = "";
  page = 1;
  renderList();
  $("#search").focus();
};
$("#sort").onchange = () => {
  page = 1;
  renderList();
};
filterIds().forEach((id) => {
  const el = $("#" + id);
  el.onchange = () => {
    page = 1;
    renderList();
  };
  if (el.tagName === "INPUT") el.oninput = el.onchange;
});
$("#filters-btn").onclick = () => {
  const show = $("#filters").hidden;
  $("#filters").hidden = !show;
  $("#filters-btn").setAttribute("aria-expanded", show);
};
$("#reset-filters").onclick = () => resetFilters();
function setView(v) {
  view = v;
  $("#table-btn").classList.toggle("active", v === "table");
  $("#grid-btn").classList.toggle("active", v === "grid");
  $("#table-btn").setAttribute("aria-pressed", v === "table");
  $("#grid-btn").setAttribute("aria-pressed", v === "grid");
  renderList();
}
$("#table-btn").onclick = () => setView("table");
$("#grid-btn").onclick = () => setView("grid");
$("#menu-btn").onclick = toggleSidebar;
$("#sidebar-close").onclick = toggleSidebar;
$("#sidebar-backdrop").onclick = closeSidebar;
$("#help-btn").onclick = help;
$("#sidebar-help").onclick = () => {
  closeSidebar();
  help();
};
$("#optimize-images-btn").onclick = optimizeLibraryImages;
$("#palette-btn").onclick = paletteDialog;
$("#backup-btn").onclick = backup;
$("#collection-backup-btn").onclick = backupCollection;
$("#import-btn").onclick = importDialog;
$("#import-file").onchange = (e) => readImport(e.target.files[0]);
$("#image-files").onchange = (e) => addImages([...e.target.files]);
$("#cover-file").onchange = (e) => addImages([...e.target.files], "cover");
window.addEventListener("beforeunload", (e) => {
  if (dirty || busy || imagesProcessing) {
    e.preventDefault();
    e.returnValue = "";
  }
});
document.addEventListener("keydown", (e) => {
  if ($("#modal").open || $("#lightbox").open) return;
  const target = e.target;
  if (
    (e.ctrlKey || e.metaKey) &&
    !target.isContentEditable &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  ) {
    if (!e.shiftKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undoChange();
      return;
    }
    if (
      e.key.toLowerCase() === "y" ||
      (e.shiftKey && e.key.toLowerCase() === "z")
    ) {
      e.preventDefault();
      redoChange();
      return;
    }
  }
  if (e.key === "Escape") {
    if (!$("#drawer").hidden) closeDrawer();
    else closeSidebar();
  }
  if (e.key === "Tab" && !$("#drawer").hidden) {
    const focusable = $$(
      "#drawer button:not(:disabled),#drawer input,#drawer textarea,#drawer select",
    ).filter((x) => x.getClientRects().length);
    const first = focusable[0],
      last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    if (editing) saveBook();
    else backup();
  }
});
if (channel)
  channel.onmessage = (e) => {
    if (state && e.data.revision > state.revision)
      toast(
        I18n.t(
          "La bibliothèque a changé dans un autre onglet. Rechargez cette page avant de modifier une fiche.",
        ),
        true,
      );
  };
boot().catch(fail);
