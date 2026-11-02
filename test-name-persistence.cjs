/* Run the shipped HTML with a DOM and IndexedDB, using synthetic books only.
 * No app handlers are replaced. This suite simulates suspension/resume and independently missing name replicas.
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
async function start(factory, options = {}) {
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
      if (options.storage)
        for (const [key, value] of Object.entries(options.storage))
          w.localStorage.setItem(key, value);
      if (options.noLocal)
        Object.defineProperty(w, "localStorage", {
          get() {
            throw new Error("Storage blocked");
          },
        });
      w.indexedDB = options.noIndexed ? undefined : factory;
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
  if (options.earlyChange) {
    const input = $("#library-name");
    input.value = "";
    input.dispatchEvent(new w.Event("change", { bubbles: true }));
  }
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

const NAME_KEY = "eigrutel-bibliotheque-name-v2";
function localState(ui) {
  const storage = ui.w.localStorage;
  return Object.fromEntries(
    Array.from({ length: storage.length }, (_, i) => {
      const k = storage.key(i);
      return [k, storage.getItem(k)];
    }),
  );
}
async function readKey(factory, key) {
  const db = await database(factory);
  return new Promise((resolve, reject) => {
    const req = db
      .transaction("state", "readonly")
      .objectStore("state")
      .get(key);
    req.onsuccess = () => {
      db.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}
async function writeKey(factory, key, value) {
  const db = await database(factory);
  await new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readwrite"),
      store = tx.objectStore("state");
    if (value === undefined) store.delete(key);
    else store.put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function flush(ui) {
  await ui.w.ensureLibraryNameSaved();
  await ui.w.eval("nameReplicaWrites");
}
async function resume(ui, event = "pageshow") {
  ui.w.dispatchEvent(new ui.w.Event(event));
  await ui.w.eval("nameRecovery");
  await ui.w.eval("nameReplicaWrites");
}
(async () => {
  const factory = new IDBFactory();
  await seed(factory);
  let ui = await start(factory, { earlyChange: true }),
    storage;
  try {
    // Every keystroke writes a durable small snapshot before blur or the debounce.
    ui.fill("library-name", "Bibliothèque iPad");
    assert.equal(
      JSON.parse(ui.w.localStorage.getItem(NAME_KEY)).name,
      "Bibliothèque iPad",
    );
    await ui.w.eval("nameReplicaWrites");
    assert.equal((await readKey(factory, NAME_KEY)).name, "Bibliothèque iPad");
    // iPad teardown can leave the visible field blank. No handler may save that blank.
    ui.w.dispatchEvent(new ui.w.Event("pagehide"));
    ui.$("#library-name").value = "";
    ui.$("#library-name").dispatchEvent(
      new ui.w.Event("change", { bubbles: true }),
    );
    await new Promise((r) => setTimeout(r, 300));
    await flush(ui);
    assert.equal((await saved(factory)).libraryName, "Bibliothèque iPad");
    await resume(ui);
    assert.equal(ui.$("#library-name").value, "Bibliothèque iPad");
    // A standalone export takes the name from the model, not a transient DOM value.
    ui.$("#library-name").value = "";
    ui.click("backup-btn");
    await until(() => ui.downloads.length === 1);
    await until(() => !ui.w.eval("busy"));
    assert.equal(ui.downloads[0].name, "bibliotheque_bibliotheque-ipad.json");
    assert.equal(
      JSON.parse(await ui.text(ui.downloads[0].blob)).libraryName,
      "Bibliothèque iPad",
    );
    assert.equal(ui.$("#library-name").value, "Bibliothèque iPad");
    assert(
      ui.w.localStorage.getItem(NAME_KEY),
      "Successful saves retain the durable local copy",
    );
    assert.equal((await readKey(factory, NAME_KEY)).name, "Bibliothèque iPad");
    // A return via visibilitychange also restores without persisting hidden DOM.
    Object.defineProperty(ui.w.document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    ui.w.document.dispatchEvent(new ui.w.Event("visibilitychange"));
    ui.fill("library-name", "");
    Object.defineProperty(ui.w.document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    ui.w.document.dispatchEvent(new ui.w.Event("visibilitychange"));
    await ui.w.eval("nameRecovery");
    assert.equal(ui.$("#library-name").value, "Bibliothèque iPad");
    assert.equal((await saved(factory)).libraryName, "Bibliothèque iPad");
    storage = localState(ui);
    const books = (await saved(factory)).books;
    ui.close();

    // Recover from the independent IndexedDB copy when the main field is empty
    // and localStorage is unavailable. No book data is reconstructed or replaced.
    let current = await saved(factory);
    await writeKey(factory, "main", { ...current, libraryName: "" });
    ui = await start(factory, { noLocal: true });
    assert.equal(ui.$("#library-name").value, "Bibliothèque iPad");
    assert.deepEqual((await saved(factory)).books, books);
    ui.fill("library-name", "Nom sans localStorage");
    await flush(ui);
    ui.close();
    ui = await start(factory, { noLocal: true });
    assert.equal(ui.$("#library-name").value, "Nom sans localStorage");
    assert.deepEqual(
      ui.errors.map((e) => e.message),
      [],
    );
    ui.close();

    // Recover from the retained local copy when both IDB name locations are missing.
    current = await saved(factory);
    await writeKey(factory, "main", {
      ...current,
      libraryName: "",
      libraryNameUpdatedAt: "",
    });
    await writeKey(factory, NAME_KEY, undefined);
    ui = await start(factory, { storage });
    assert.equal(ui.$("#library-name").value, "Bibliothèque iPad");
    assert.equal((await readKey(factory, NAME_KEY)).name, "Bibliothèque iPad");
    assert.deepEqual((await saved(factory)).books, books);

    // An intentional clear is a timestamped edit and defeats an older nonempty replica.
    const staleStorage = localState(ui);
    ui.fill("library-name", "");
    await flush(ui);
    assert.equal((await saved(factory)).libraryName, "");
    assert.equal((await readKey(factory, NAME_KEY)).name, "");
    ui.close();
    ui = await start(factory, { storage: staleStorage });
    assert.equal(ui.$("#library-name").value, "");
    assert.equal(JSON.parse(ui.w.localStorage.getItem(NAME_KEY)).name, "");
    ui.click("backup-btn");
    await until(() => ui.downloads.length === 1);
    assert.equal(ui.downloads[0].name, "bibliotheque.json");
    await until(() => !ui.w.eval("busy"));

    // Rapid edits, unrelated commits and language changes never restore an older name.
    ui.fill("library-name", "Ancien");
    ui.fill("library-name", "Intermédiaire");
    ui.fill("library-name", "Le dernier nom");
    await flush(ui);
    const finalRecord = await readKey(factory, NAME_KEY);
    assert.equal(finalRecord.name, "Le dernier nom");
    const old = await saved(factory);
    old.libraryName = "Nom périmé";
    old.libraryNameUpdatedAt = "2020-01-01T00:00:00.000Z";
    ui.w.stale = old;
    await ui.w.eval("commit(stale)");
    assert.equal((await saved(factory)).libraryName, "Le dernier nom");
    assert.equal(
      (await saved(factory)).libraryNameUpdatedAt,
      finalRecord.updatedAt,
    );
    ui.click("language-switch");
    assert.equal(ui.$("#library-name").value, "Le dernier nom");
    storage = localState(ui);
    ui.close();

    // A pending name survives closing before debounce; new edits win over stale main metadata.
    ui = await start(factory, { storage });
    ui.fill("library-name", "Avant fermeture immédiate");
    const pending = localState(ui);
    ui.close();
    ui = await start(factory, { storage: pending });
    assert.equal(ui.$("#library-name").value, "Avant fermeture immédiate");
    assert.equal(
      (await saved(factory)).libraryName,
      "Avant fermeture immédiate",
    );
    // Full imports can intentionally replace or clear the name and its replicas.
    for (const name of ["Nom importé", ""]) {
      const incoming = { ...C.emptyLibrary(), libraryName: name, books: [] };
      await ui.w.readImport({
        name: "test.json",
        size: 100,
        text: async () => JSON.stringify(incoming),
      });
      ui.$('input[value="replace"]').checked = true;
      ui.click("confirm-import");
      await until(() => !ui.$("#modal").open);
      await ui.w.eval("nameReplicaWrites");
      assert.equal(JSON.parse(ui.w.localStorage.getItem(NAME_KEY)).name, name);
      assert.equal((await readKey(factory, NAME_KEY)).name, name);
      await resume(ui);
      assert.equal(ui.$("#library-name").value, name);
    }
    assert.deepEqual(
      ui.errors.map((e) => e.message),
      [],
    );
    ui.close();

    // Invalid local data is ignored when IndexedDB holds a valid copy.
    const record = {
      version: 2,
      name: "Copie saine",
      updatedAt: new Date().toISOString(),
    };
    await writeKey(factory, NAME_KEY, record);
    ui = await start(factory, { storage: { [NAME_KEY]: '{"bad":true}' } });
    assert.equal(ui.$("#library-name").value, "Copie saine");
    assert.equal(
      JSON.parse(ui.w.localStorage.getItem(NAME_KEY)).name,
      "Copie saine",
    );
    ui.close();

    // The name remains recoverable when IndexedDB itself is unavailable.
    ui = await start(new IDBFactory(), {
      noIndexed: true,
      storage: { [NAME_KEY]: JSON.stringify(record) },
    });
    assert.equal(ui.$("#library-name").value, "Copie saine");
    ui.fill("library-name", "Copie locale");
    await flush(ui);
    const localOnly = localState(ui);
    ui.close();
    ui = await start(new IDBFactory(), { noIndexed: true, storage: localOnly });
    assert.equal(ui.$("#library-name").value, "Copie locale");
    ui.click("backup-btn");
    await until(() => ui.downloads.length === 1);
    assert.equal(ui.downloads[0].name, "bibliotheque_copie-locale.json");
    assert.deepEqual(
      ui.errors.map((e) => e.message),
      [],
    );
    console.log(
      "PASS: durable localStorage + independent IndexedDB name snapshots, teardown/blank DOM protection, pageshow and visibility resume, named exports, fallback after missing replicas, noLocal/noIndexed modes, intentional clear, imports, rapid edits, language, timestamp protection and immediate close.",
    );
  } finally {
    ui.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
