/* Run the shipped HTML with a DOM and IndexedDB, using synthetic books only.
 * No app handlers are replaced. The actual PDF renderer and native image decoder run in this test.
 * This is an integration simulation, not an iPad/WebKit browser test.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const { IDBFactory } = require("fake-indexeddb");
const C = require("./core.js");
const { createCanvas, Image } = require("@napi-rs/canvas");
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
async function start(factory, journal = null) {
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
      if (journal)
        w.localStorage.setItem("eigrutel-bibliotheque-name-draft-v1", journal);
      w.Image = Image;
      const create = w.document.createElement.bind(w.document);
      w.document.createElement = (name, ...args) =>
        name === "canvas" ? createCanvas(1, 1) : create(name, ...args);
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

async function put(factory, value) {
  const db = await database(factory);
  await new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readwrite");
    tx.objectStore("state").put(value, "main");
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
(async () => {
  const factory = new IDBFactory();
  const canvas = createCanvas(1200, 1600),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(0, 0, 1200, 1600);
  ctx.fillStyle = "#004d65";
  ctx.font = "28px sans-serif";
  for (let y = 40; y < 1600; y += 50)
    ctx.fillText("Image de contrôle 0123456789", 30, y);
  const picture = canvas.toDataURL("image/jpeg", 0.98);
  const books = Array.from({ length: 201 }, (_, i) =>
    C.book({
      id: "book-" + i,
      title: "Livre " + String(i).padStart(3, "0"),
      number: String(i + 1),
      collection: "Séries",
      author: "Auteur test",
    }),
  );
  books[0].publisher = " Penguin CLASSICS ";
  books[0].summary = "SENTINEL_RESUME **Résumé en gras**";
  books[0].notes = "SENTINEL_NOTE_PRIVEE";
  books[0].images = [
    { id: "sum", role: "summary", name: "summary.jpg", data: picture },
    { id: "note", role: "note", name: "note.jpg", data: picture },
  ];
  books[1].summary = "Résumé seul";
  books[1].images = [
    { id: "summary-only", role: "summary", name: "summary.jpg", data: picture },
  ];
  books[2].images = [
    { id: "cover", role: "cover", name: "cover.jpg", data: picture },
  ];
  books[100].images = [
    { id: "note-only", role: "note", name: "note.jpg", data: picture },
  ];
  books[200].collection = "Penguin Classics";
  assert(C.isPenguin(" PENGUIN  Classics "));
  assert(!C.isPenguin("Not Penguin"));
  assert.equal(C.noteImages(books[1]).length, 0);
  assert(!C.hasNotes(books[1]));
  assert.equal(
    C.validate({
      ...C.emptyLibrary(),
      books: [{ ...books[1], summary: undefined }],
    }).books[0].summary,
    "",
  );
  assert.throws(
    () =>
      C.validate({
        ...C.emptyLibrary(),
        books: [{ ...books[1], summary: 42 }],
      }),
    /summary/,
  );
  const copy = C.duplicateBook({
    ...books[0],
    summary: "![Résumé](attachment:sum)",
  });
  assert(copy.summary.includes(copy.images[0].id));
  assert(!copy.summary.includes("attachment:sum)"));
  await put(factory, {
    ...C.emptyLibrary(),
    revision: 0,
    libraryName: "Test 140",
    books,
  });
  let ui = await start(factory);
  const readBytes = (blob) =>
    new Promise((resolve, reject) => {
      const r = new ui.w.FileReader();
      r.onload = () => resolve(Buffer.from(r.result));
      r.onerror = reject;
      r.readAsArrayBuffer(blob);
    });
  const output = process.env.PDF_TEST_OUTPUT;
  if (output) fs.mkdirSync(output, { recursive: true });
  try {
    // 100 records, upward page selector, existing arrows and filter clamping.
    assert.equal(ui.$("#books tbody").children.length, 100);
    assert.equal(ui.$("#page-jump-toggle").textContent, "1 / 3");
    ui.click("page-jump-toggle");
    assert(!ui.$("#page-menu").hidden);
    ui.$('[data-page="3"]').click();
    assert.equal(ui.$("#books tbody").children.length, 1);
    assert(ui.$("#next-page").disabled);
    assert.equal(ui.$("#page-jump-toggle").textContent, "3 / 3");
    ui.click("prev-page");
    assert.equal(ui.$("#books tbody").children.length, 100);
    ui.fill("search", "Livre 200");
    assert.equal(ui.$("#page-jump-toggle").textContent, "1 / 1");
    assert(ui.$("#page-jump-toggle").disabled);
    ui.click("clear-search");
    ui.click("grid-btn");
    assert.equal(ui.w.document.querySelectorAll(".book-card").length, 100);
    assert(
      ui.$('[data-book="book-0"] .faux-cover.penguin'),
      "Publisher triggers Penguin style",
    );
    assert(ui.$('[data-book="book-2"] img').getAttribute("loading") === "lazy");
    ui.click("page-jump-toggle");
    ui.$('[data-page="3"]').click();
    assert(
      ui.$('[data-book="book-200"] .faux-cover.penguin'),
      "Collection triggers Penguin Classics style",
    );
    ui.click("page-jump-toggle");
    ui.$('[data-page="1"]').click();
    // Save, preview, translate and reload the separate rich summary.
    ui.$('[data-book="book-0"]').click();
    ui.click("edit-book");
    ui.fill("f-summary", "SENTINEL_RESUME Résumé en gras");
    ui.$("#f-summary").setSelectionRange(17, 31);
    ui.$('[data-text-editor="summary"] [data-format="bold"]').click();
    assert(ui.$("#f-summary").value.includes("**"));
    const summary = ui.$("#f-summary").value;
    ui.click("preview-summary");
    assert(ui.$("#summary-preview strong"));
    ui.click("language-switch");
    assert.equal(ui.$("#f-summary").value, summary);
    assert(!ui.$("#summary-preview").hidden);
    ui.click("language-switch");
    ui.click("save-book");
    await until(() => ui.$("#edit-book"));
    assert.equal((await saved(factory)).books[0].summary, summary);
    assert(ui.$("#drawer-body").textContent.includes("Résumé"));
    ui.click("pdf-no-notes");
    await until(() => ui.$(".pdf-download"));
    let link = ui.$(".pdf-download");
    assert(link.download.includes("test-140_fiche_sans_notes"));
    if (output)
      fs.writeFileSync(
        output + "/single-no-notes.pdf",
        await readBytes(ui.blobs.get(link.href)),
      );
    ui.$("[data-close-modal]").click();
    ui.click("close-drawer");
    ui.click("backup-btn");
    await until(() => ui.downloads.length === 1);
    const backup = JSON.parse(await ui.text(ui.downloads[0].blob));
    await until(() => !ui.w.eval("busy"));
    assert.equal(backup.books[0].summary, summary);
    assert.equal(
      C.merge(C.emptyLibrary(), C.validate(backup), "add").books[0].summary,
      summary,
    );
    ui.close();
    ui = await start(factory);
    assert.equal((await saved(factory)).books[0].summary, summary);
    // Notes / images slideshow includes only notes, across pages, in filtered order.
    assert.equal(ui.$("#stat-notes strong").textContent, "2");
    assert.equal(ui.$("#stat-images strong").textContent, "2");
    ui.$('[data-scope="notes"]').click();
    assert(!ui.$("#view-notes").hidden);
    ui.click("view-notes");
    assert.equal(ui.$("#slide-position").textContent, "1 / 2");
    assert(ui.$("#note-slide").textContent.includes("SENTINEL_NOTE_PRIVEE"));
    assert(!ui.$("#note-slide").textContent.includes("SENTINEL_RESUME"));
    assert.equal(
      ui.$("#note-slide").querySelectorAll("[data-image]").length,
      1,
    );
    ui.click("slide-next");
    assert.equal(ui.$("#slide-position").textContent, "2 / 2");
    assert(ui.$("#slide-next").disabled);
    ui.$("#modal").dispatchEvent(
      new ui.w.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    assert.equal(ui.$("#slide-position").textContent, "1 / 2");
    ui.$("[data-close-modal]").click();
    assert(!ui.$("#modal").classList.contains("notes-slideshow"));
    ui.$('[data-scope="images"]').click();
    ui.fill("search", "Livre 100");
    ui.click("view-notes");
    assert.equal(ui.$("#slide-position").textContent, "1 / 1");
    ui.$("[data-close-modal]").click();
    ui.$('[data-scope="all"]').click();
    ui.click("clear-search");
    assert(ui.$("#view-notes").hidden);
    // Both layouts support full-record-without-notes, including summary-only records.
    ui.click("select-books");
    ui.$('[data-book="book-0"]').click();
    ui.$('[data-book="book-1"]').click();
    for (const group of ["combined", "separate"]) {
      ui.click("export-selected");
      ui.$('[name="pdf-content"][value="no-notes"]').click();
      ui.$('[name="pdf-group"][value="' + group + '"]').click();
      ui.click("selection-pdf-generate");
      await until(() => !ui.$("#selection-pdf-generate").disabled);
      const links = [
        ...ui.w.document.querySelectorAll(
          "#selection-pdf-downloads [download]",
        ),
      ];
      assert.equal(
        links.length,
        group === "combined" ? 1 : 2,
        ui.$("#selection-pdf-progress").textContent,
      );
      for (const [i, link] of links.entries()) {
        assert(link.download.includes("sans_notes"));
        if (output)
          fs.writeFileSync(
            output + "/selection-" + group + "-" + i + ".pdf",
            await readBytes(ui.blobs.get(link.href)),
          );
      }
      ui.click("selection-pdf-cancel");
    }
    // Original full and notes-only variants: summary never leaks into notes-only.
    ui.w.pdfBook = books[0];
    for (const [kind, expr] of [
      ["full", "false"],
      ["notes", "true"],
    ]) {
      const bytes = await ui.w.eval(
        "LibraryPDF.create(pdfBook,state.palette," + expr + ',"Test 140")',
      );
      if (output)
        fs.writeFileSync(output + "/" + kind + ".pdf", Buffer.from(bytes));
    }
    // Provisional sliders: cancelling never replaces stored bytes. Moving a slider
    // after computing a proposal invalidates it, then recomputes from originals.
    const before = (await saved(factory)).books[2].images[0].data;
    ui.click("optimize-images-btn");
    await until(
      () => ui.$("#modal").open && ui.$("#opt-cover-height")?.value === "400",
    );
    ui.fill("opt-cover-height", "200");
    ui.fill("opt-note-width", "600");
    assert.equal(ui.$("#opt-cover-value").textContent, "200 px");
    ui.click("optimization-start");
    await until(() => !ui.$("#optimization-apply").hidden);
    assert.equal((await saved(factory)).books[2].images[0].data, before);
    ui.fill("opt-cover-height", "300");
    assert(ui.$("#optimization-apply").hidden);
    assert(!ui.$("#optimization-start").hidden);
    ui.click("optimization-cancel");
    assert.equal((await saved(factory)).books[2].images[0].data, before);
    ui.click("optimize-images-btn");
    await until(
      () => ui.$("#modal").open && ui.$("#opt-cover-height")?.value === "400",
    );
    assert.equal(ui.$("#opt-cover-height").value, "400");
    ui.fill("opt-cover-height", "200");
    ui.fill("opt-note-width", "600");
    ui.click("optimization-start");
    await until(() => !ui.$("#optimization-apply").hidden);
    ui.click("optimization-apply");
    await until(() => !ui.$("#modal").open);
    const optimized = await saved(factory);
    assert.equal(optimized.books[2].images[0].optimization.height, 200);
    assert.equal(optimized.books[0].images[1].optimization.width, 600);
    assert.equal(optimized.books[0].images[0].optimization.width, 600);
    assert.equal(optimized.books[0].summary, summary);
    assert.equal(optimized.libraryName, "Test 140");
    assert.deepEqual(
      ui.errors.map((e) => e.message),
      [],
    );
    console.log(
      "PASS 1.4.0: 100/page + direct jump, summary save/FR-EN/reload/JSON/duplicate, Penguin publisher/collection, scoped note slideshow, all PDF variants, provisional sliders/cancel/invalidation/apply.",
    );
  } finally {
    ui.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
