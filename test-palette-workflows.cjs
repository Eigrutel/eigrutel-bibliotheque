/* Run the shipped HTML with a DOM and IndexedDB, using synthetic books only.
 * No app handlers are replaced. Colour editing, JSON export and import use the actual app handlers.
 * This is an integration simulation, not an iPad/WebKit browser test.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const { IDBFactory } = require("fake-indexeddb");
const C = require("./core.js");
const html = fs.readFileSync(
  process.argv[2] || "dist/bibliotheque.html",
  "utf8",
);
const delay = () => new Promise((resolve) => setTimeout(resolve, 10));
async function until(check) {
  for (let i = 0; i < 500; i++) {
    if (check()) return;
    await delay();
  }
  throw Error("Workflow timed out");
}
async function database(factory) {
  return new Promise((resolve, reject) => {
    const request = factory.open("eigrutel-bibliotheque-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function saved(factory) {
  const db = await database(factory);
  return new Promise((resolve, reject) => {
    const req = db
      .transaction("state", "readonly")
      .objectStore("state")
      .get("main");
    req.onsuccess = () => {
      db.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}
async function seed(factory) {
  const db = await database(factory);
  await new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readwrite");
    tx.objectStore("state").put(
      {
        ...C.emptyLibrary(),
        revision: 0,
        books: [
          C.book({
            id: "loan",
            title: "Un livre test",
            collection: "Pro",
            loanName: "Alex",
            loanDate: "2026-10-28",
            notes: "Notes de test",
          }),
          C.book({ id: "other", title: "Autre livre", collection: "Pro" }),
        ],
      },
      "main",
    );
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function start(factory) {
  const downloads = [],
    errors = [],
    blobs = new Map();
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e));
  vc.on("error", (e) => errors.push(e));
  const dom = new JSDOM(html, {
    url: "https://library.test/bibliotheque.html",
    runScripts: "dangerously",
    virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = factory;
      w.structuredClone = structuredClone;
      w.TextEncoder = TextEncoder;
      w.TextDecoder = TextDecoder;
      w.matchMedia = () => ({ matches: false, addEventListener() {} });
      w.confirm = () => true;
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
      w.HTMLDialogElement.prototype.close = function () {
        this.open = false;
        this.dispatchEvent(new w.Event("close"));
      };
      w.URL.createObjectURL = (blob) => {
        const url = "blob:test-" + blobs.size;
        blobs.set(url, blob);
        return url;
      };
      w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = function () {
        downloads.push({ name: this.download, blob: blobs.get(this.href) });
      };
    },
  });
  const w = dom.window,
    $ = (s) => w.document.querySelector(s);
  await until(() => $('#navigation [data-scope="all"]'));
  const fill = (id, value, event = "input") => {
    const el = $("#" + id);
    assert(el, id);
    el.value = value;
    el.dispatchEvent(new w.Event(event, { bubbles: true }));
  };
  const click = (id) => {
    assert($("#" + id), id);
    $("#" + id).click();
  };
  const open = () => {
    const node = $('[data-book="loan"]');
    assert(node);
    node.click();
    click("edit-book");
  };
  const text = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new w.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(blob);
    });
  return {
    w,
    $,
    fill,
    click,
    open,
    downloads,
    errors,
    blobs,
    text,
    close: () => {
      w.eval("db?.close()");
      w.close();
    },
  };
}

async function storeLibrary(factory, data) {
  const db = await database(factory);
  await new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readwrite");
    tx.objectStore("state").put(data, "main");
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function importJSON(ui, data, mode = "add") {
  await ui.w.readImport({
    name: "bibliotheque-test.json",
    size: 100,
    text: async () => JSON.stringify(data),
  });
  assert(ui.$('input[name="import-mode"][value="' + mode + '"]'));
  ui.$('input[name="import-mode"][value="' + mode + '"]').checked = true;
  ui.click("confirm-import");
  await until(() => !ui.$("#modal").open);
}
(async () => {
  const source = new IDBFactory();
  await seed(source);
  const initial = await saved(source);
  initial.books[0].colors = [C.PALETTE[0].id];
  await storeLibrary(source, initial);
  let ui = await start(source),
    full,
    collection;
  try {
    // Saving reads native input values even when no input event was emitted.
    ui.click("palette-btn");
    ui.$('[data-palette-hex="0"]').value = "#123abc";
    ui.$('[data-palette-name="0"]').value = "Océan personnel";
    ui.click("add-color");
    const last =
      ui.w.document.querySelectorAll("[data-palette-hex]").length - 1;
    ui.$('[data-palette-hex="' + last + '"]').value = "#963375";
    ui.$('[data-palette-name="' + last + '"]').value = "Repère ajouté";
    ui.click("save-palette");
    await until(() => !ui.$("#modal").open);
    assert.equal((await saved(source)).palette[0].hex, "#123abc");
    ui.close();
    ui = await start(source);
    ui.click("palette-btn");
    assert.equal(ui.$('[data-palette-name="0"]').value, "Océan personnel");
    ui.$("#modal").close();
    ui.click("backup-btn");
    await until(() => ui.downloads.length === 1);
    await until(() => !ui.w.eval("busy"));
    full = JSON.parse(await ui.text(ui.downloads[0].blob));
    assert.equal(full.palette.length, 9);
    ui.$('[data-scope="collection:Pro"]').click();
    ui.click("collection-backup-btn");
    await until(() => ui.downloads.length === 2);
    collection = JSON.parse(await ui.text(ui.downloads[1].blob));
    assert.deepEqual(collection.palette, full.palette);
    assert.equal(collection.books[0].colors[0], full.palette[0].id);
    assert.deepEqual(
      ui.errors.map((e) => e.message),
      [],
    );
  } finally {
    ui.close();
  }
  // New destination databases model independent devices and all import modes.
  for (const mode of ["add", "update", "replace-collection", "replace"]) {
    const factory = new IDBFactory(),
      local = {
        ...C.emptyLibrary(),
        revision: 0,
        books: [
          C.book({ id: "local", title: "Livre local", collection: "Autre" }),
        ],
      };
    local.palette[0] = {
      ...local.palette[0],
      name: "Ancien bleu",
      hex: "#222222",
    };
    local.palette.push({
      id: "local-only",
      name: "Seulement ici",
      hex: "#abcdef",
    });
    await storeLibrary(factory, local);
    ui = await start(factory);
    try {
      await importJSON(
        ui,
        mode === "replace-collection" ? collection : full,
        mode,
      );
      const after = await saved(factory);
      assert.equal(after.palette[0].hex, "#123abc");
      assert.equal(after.palette[0].name, "Océan personnel");
      assert(
        after.palette.some(
          (p) => p.name === "Repère ajouté" && p.hex === "#963375",
        ),
      );
      assert.equal(
        after.palette.some((p) => p.id === "local-only"),
        mode !== "replace",
      );
      assert.equal(
        after.books.some((b) => b.id === "local"),
        mode !== "replace",
      );
      ui.close();
      ui = await start(factory);
      ui.click("palette-btn");
      assert.equal(ui.$('[data-palette-hex="0"]').value, "#123abc");
      assert.equal(ui.$('[data-palette-name="0"]').value, "Océan personnel");
      ui.$("#modal").close();
      ui.click("backup-btn");
      await until(() => ui.downloads.length === 1);
      await until(() => !ui.w.eval("busy"));
      assert.deepEqual(
        JSON.parse(await ui.text(ui.downloads[0].blob)).palette,
        after.palette,
      );
      ui.click("import-btn");
      ui.click("undo-import");
      await until(() => !ui.$("#modal").open);
      assert.deepEqual((await saved(factory)).palette, local.palette);
      // A file with no palette must not reset this device's custom labels.
      const legacy = { ...full };
      delete legacy.palette;
      await importJSON(ui, legacy);
      assert.deepEqual((await saved(factory)).palette, local.palette);
      assert.deepEqual(
        ui.errors.map((e) => e.message),
        [],
      );
    } finally {
      ui.close();
    }
  }
  // Remove labels in a draft, then save the palette and book assignments atomically.
  const removalFactory = new IDBFactory();
  const blue = full.palette[0].id,
    yellow = full.palette[1].id,
    unused = full.palette[2].id;
  const removalLibrary = {
    ...C.clone(full),
    revision: 0,
    books: [
      C.book({
        id: "one",
        title: "Premier",
        collection: "Pro",
        colors: [blue, yellow],
        notes: "Notes conservées",
      }),
      C.book({
        id: "two",
        title: "Deuxième",
        collection: "Autre",
        colors: [blue],
      }),
      C.book({
        id: "trash",
        title: "Retiré",
        collection: "Pro",
        colors: [blue],
        deletedAt: "2026-10-28T00:00:00.000Z",
      }),
    ],
  };
  await storeLibrary(removalFactory, removalLibrary);
  ui = await start(removalFactory);
  let deletionBackup, collectionDeletionBackup;
  try {
    const prompts = [];
    ui.w.confirm = (message) => {
      prompts.push(message);
      return false;
    };
    ui.click("palette-btn");
    ui.$('[data-remove-palette="0"]').click();
    assert.equal(
      ui.w.document.querySelectorAll("[data-remove-palette]").length,
      full.palette.length,
    );
    assert(prompts[0].includes("3 livre(s), corbeille comprise"));
    ui.w.confirm = () => true;
    ui.$('[data-remove-palette="0"]').click();
    assert.equal(
      (await saved(removalFactory)).palette.length,
      full.palette.length,
    );
    ui.click("cancel-palette");
    assert.deepEqual((await saved(removalFactory)).books, removalLibrary.books);
    ui.click("palette-btn");
    ui.$('[data-remove-palette="0"]').click();
    ui.$('[data-palette-name="0"]').value = "Repère conservé";
    let unusedPrompts = 0;
    ui.w.confirm = () => {
      unusedPrompts++;
      return true;
    };
    ui.$('[data-remove-palette="1"]').click();
    assert.equal(unusedPrompts, 0, "Unused labels need no confirmation");
    assert.equal(ui.$('[data-palette-name="0"]').value, "Repère conservé");
    ui.click("save-palette");
    ui.click("save-palette");
    await until(() => !ui.$("#modal").open);
    const removed = await saved(removalFactory);
    assert.equal(removed.palette.length, full.palette.length - 2);
    assert.equal(removed.palette[0].name, "Repère conservé");
    assert.deepEqual(
      [...removed.removedPaletteIds].sort(),
      [blue, unused].sort(),
    );
    assert.deepEqual(
      removed.books,
      removalLibrary.books.map((b) => ({
        ...b,
        colors: b.colors.filter((id) => id !== blue),
      })),
    );
    ui.click("undo-btn");
    await until(() => !ui.w.eval("busy"));
    assert.deepEqual((await saved(removalFactory)).palette, full.palette);
    assert.deepEqual((await saved(removalFactory)).books, removalLibrary.books);
    ui.click("redo-btn");
    await until(() => !ui.w.eval("busy"));
    assert.deepEqual((await saved(removalFactory)).palette, removed.palette);
    ui.close();
    ui = await start(removalFactory);
    assert(!(await saved(removalFactory)).palette.some((p) => p.id === blue));
    ui.click("backup-btn");
    await until(() => ui.downloads.length === 1);
    await until(() => !ui.w.eval("busy"));
    deletionBackup = JSON.parse(await ui.text(ui.downloads[0].blob));
    ui.$('[data-scope="collection:Pro"]').click();
    ui.click("collection-backup-btn");
    await until(() => ui.downloads.length === 2);
    collectionDeletionBackup = JSON.parse(await ui.text(ui.downloads[1].blob));
    assert.deepEqual(
      collectionDeletionBackup.removedPaletteIds,
      deletionBackup.removedPaletteIds,
    );
    ui.click("language-switch");
    ui.click("palette-btn");
    assert(
      ui
        .$('[data-remove-palette="0"]')
        .getAttribute("aria-label")
        .startsWith("Remove colour label"),
    );
    ui.click("cancel-palette");
    assert.deepEqual(
      ui.errors.map((e) => e.message),
      [],
    );
  } finally {
    ui.close();
  }
  for (const backup of [deletionBackup, collectionDeletionBackup]) {
    const otherDevice = new IDBFactory();
    await storeLibrary(otherDevice, {
      ...C.emptyLibrary(),
      revision: 0,
      books: [
        C.book({
          id: "local-book",
          title: "Déjà présent",
          collection: "Autre",
          colors: [blue, yellow],
        }),
      ],
    });
    ui = await start(otherDevice);
    try {
      await importJSON(ui, backup);
      let current = await saved(otherDevice);
      assert(!current.palette.some((p) => p.id === blue || p.id === unused));
      assert(current.books.every((b) => !b.colors.includes(blue)));
      assert.deepEqual(
        current.books.find((b) => b.id === "local-book").colors,
        [yellow],
      );
      ui.close();
      ui = await start(otherDevice);
      assert(
        !ui.w
          .eval("state.palette")
          .some((p) => p.id === blue || p.id === unused),
      );
      // Explicit definitions in an old backup may restore a previously removed label.
      await importJSON(ui, full);
      current = await saved(otherDevice);
      assert(current.palette.some((p) => p.id === blue));
      assert(!current.removedPaletteIds.includes(blue));
      assert.deepEqual(
        ui.errors.map((e) => e.message),
        [],
      );
    } finally {
      ui.close();
    }
  }
  // An empty palette remains empty after saving, reloading and transferring.
  const emptyFactory = new IDBFactory();
  ui = await start(emptyFactory);
  try {
    ui.click("palette-btn");
    while (ui.$("[data-remove-palette]")) ui.$("[data-remove-palette]").click();
    ui.click("save-palette");
    await until(() => !ui.$("#modal").open);
    assert.equal((await saved(emptyFactory)).palette.length, 0);
    ui.close();
    ui = await start(emptyFactory);
    assert.equal(ui.w.eval("state.palette.length"), 0);
    ui.click("palette-btn");
    ui.click("add-color");
    assert.equal(
      ui.w.document.querySelectorAll("[data-remove-palette]").length,
      1,
    );
    ui.click("save-palette");
    await until(() => !ui.$("#modal").open);
    assert.equal((await saved(emptyFactory)).palette.length, 1);
    assert.deepEqual(
      ui.errors.map((e) => e.message),
      [],
    );
  } finally {
    ui.close();
  }
  const dates = ["1935", "1950", "2026", "", "inconnu", "1950"].map((year, i) =>
    C.book({
      id: String(i),
      title: "Même titre",
      year,
      number: String(10 - i),
    }),
  );
  assert.deepEqual(
    [...dates].sort((a, b) => C.compareBooks(a, b, "year")).map((b) => b.id),
    ["0", "5", "1", "2", "4", "3"],
  );
  assert.deepEqual(
    [...dates]
      .sort((a, b) => C.compareBooks(a, b, "year-desc"))
      .map((b) => b.id),
    ["2", "5", "1", "0", "4", "3"],
  );
  ui = await start(new IDBFactory());
  try {
    assert.equal(
      ui.$('#sort option[value="year"]').textContent.trim(),
      "Année ↑",
    );
    assert.equal(
      ui.$('#sort option[value="year-desc"]').textContent.trim(),
      "Année ↓",
    );
    ui.click("language-switch");
    assert.equal(
      ui.$('#sort option[value="year"]').textContent.trim(),
      "Year ↑",
    );
    assert.equal(
      ui.$('#sort option[value="year-desc"]').textContent.trim(),
      "Year ↓",
    );
  } finally {
    ui.close();
  }
  console.log(
    "PASS: colour editing and reload, full/collection JSON palettes, fresh-device import in all four modes, custom IDs and local-only labels, import undo, legacy files, ascending/descending years with missing years last, short FR/EN labels, label removal/cancel/save, used-book count, Trash, Undo/Redo, JSON removal transfer and empty palettes.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
