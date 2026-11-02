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
  const series = ["10 · La fin", "2 La suite", "1 Le début"].map((number, i) =>
    C.book({ id: String(i), title: i === 1 ? "DONITO" : "Donito", number }),
  );
  assert.deepEqual(
    series
      .sort((a, b) => C.compareBooks(a, b, "title"))
      .map((b) => C.volumeNumber(b.number)),
    [1, 2, 10],
  );
  assert.equal(C.volumeNumber("N° 12 · Album"), 12);
  assert.equal(C.volumeNumber("Sans numéro"), null);
  const years = ["2020", "Édition 1930", "inconnue", "1950 / 1980", ""].map(
    (year, i) => C.book({ id: String(i), title: "Titre", year }),
  );
  assert.deepEqual(
    years.sort((a, b) => C.compareBooks(a, b, "year")).map((b) => b.year),
    ["Édition 1930", "1950 / 1980", "2020", "inconnue", ""],
  );
  assert(C.isPenguin(" PENGUIN "));
  assert(C.isPenguin("Penguin Classics"));
  assert(C.isQueSaisJe("Que sais-je?"));
  const factory = new IDBFactory();
  await seed(factory);
  let ui = await start(factory);
  try {
    // Typing alone saves the name. A separate stale book save cannot revert it.
    const oldState = await saved(factory);
    ui.fill("library-name", "Nom autonome");
    await new Promise((r) => setTimeout(r, 350));
    await ui.w.eval("libraryNameWrites");
    assert.equal((await saved(factory)).libraryName, "Nom autonome");
    ui.w.staleState = oldState;
    await ui.w.eval("commit(staleState)");
    assert.equal((await saved(factory)).libraryName, "Nom autonome");
    ui.click("undo-btn");
    await until(() => !ui.w.eval("busy"));
    assert.equal((await saved(factory)).libraryName, "Nom autonome");
    // A rename made during a write is queued rather than discarded.
    const write = ui.w.eval('commit({...state, updatedAt:"concurrent"})');
    const rename = ui.w.saveLibraryName("Nom pendant sauvegarde");
    await Promise.all([write, rename]);
    assert.equal((await saved(factory)).libraryName, "Nom pendant sauvegarde");
    ui.close();
    ui = await start(factory);
    assert.equal(ui.$("#library-name").value, "Nom pendant sauvegarde");
    // Close before blur/debounce, then recover the synchronous journal on boot.
    ui.fill("library-name", "Nom avant fermeture");
    const journal = ui.w.localStorage.getItem(
      "eigrutel-bibliotheque-name-draft-v1",
    );
    assert.equal(JSON.parse(journal).name, "Nom avant fermeture");
    ui.close();
    ui = await start(factory, journal);
    await ui.w.eval("libraryNameWrites");
    assert.equal((await saved(factory)).libraryName, "Nom avant fermeture");
    assert.equal(ui.$("#library-name").value, "Nom avant fermeture");
    ui.fill("library-name", "");
    ui.click("backup-btn");
    await until(() => ui.downloads.length === 1);
    assert.equal((await saved(factory)).libraryName, "");
    assert.equal(ui.downloads[0].name, "bibliotheque.json");
    ui.fill("library-name", "Bibliothèque série");
    ui.click("backup-btn");
    await until(() => ui.downloads.length === 2);
    assert.equal(ui.downloads[1].name, "bibliotheque_bibliotheque-serie.json");
    assert.equal(
      JSON.parse(await ui.text(ui.downloads[1].blob)).libraryName,
      "Bibliothèque série",
    );
    assert.deepEqual(
      ui.errors.map((e) => e.message),
      [],
    );
    ui.close();

    const canvas = createCanvas(360, 480),
      ctx = canvas.getContext("2d");
    ctx.fillStyle = "#004d65";
    ctx.fillRect(0, 0, 360, 480);
    ctx.fillStyle = "white";
    ctx.font = "30px sans-serif";
    ctx.fillText("Couverture test", 35, 110);
    const cover = canvas.toDataURL("image/png");
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(0, 0, 360, 480);
    ctx.fillStyle = "#004d65";
    ctx.fillText("Image des notes", 35, 110);
    const note = canvas.toDataURL("image/png");
    const books = [
      C.book({
        id: "a",
        title: "Les aventures",
        number: "2 · La traversée",
        collection: "Penguin",
        author: "Auteur témoin",
        publisher: "Éditeur témoin",
        year: "1935",
        pages: "120",
        language: "Français",
        notes:
          "# Notes du premier livre\nTexte **en gras**, *italique* et [color=#d00000]rouge[/color] et [highlight=#ffe58a]surligné[/highlight].\n![Schéma](attachment:note-a)",
        images: [
          {
            id: "note-a",
            role: "note",
            name: "note.png",
            caption: "Schéma des notes",
            data: note,
          },
        ],
      }),
      C.book({
        id: "b",
        title: "Les aventures",
        number: "10 · Le retour",
        collection: "Penguin",
        author: "Autre auteur",
        year: "1950",
        notes: Array.from(
          { length: 65 },
          (_, i) =>
            "Paragraphe " +
            (i + 1) +
            " : observation de lecture, texte vérifiable pour contrôler la pagination du document.",
        ).join("\n\n"),
        images: [
          { id: "cover-b", role: "cover", name: "cover.png", data: cover },
        ],
      }),
    ];
    await put(factory, {
      ...C.emptyLibrary(),
      revision: 0,
      libraryName: "Bibliothèque série",
      books,
    });
    ui = await start(factory);
    ui.click("grid-btn");
    const card = ui.$('[data-book="a"]').closest("article");
    assert(card.querySelector(".faux-cover.penguin"));
    assert.equal(
      card.querySelector("h3").nextElementSibling.className,
      "card-number muted",
    );
    assert.equal(
      card.querySelector(".card-number").nextElementSibling.className,
      "card-author muted",
    );
    assert(!ui.$('[data-book="b"]').querySelector(".faux-cover"));
    ui.$('[data-book="a"]').click();
    ui.click("edit-book");
    assert.equal(ui.$("#f-number").value, "2 · La traversée");
    assert(
      ui.$('label[for="f-number"]').textContent.includes("N° et sous-titre"),
    );
    ui.click("cancel-edit");
    ui.click("close-drawer");
    ui.fill("sort", "year", "change"); // chronological order in the actual view
    assert.deepEqual(
      [...ui.w.eval("filtered()")].map((b) => b.id),
      ["a", "b"],
    );
    ui.click("select-books");
    ui.$('[data-book="a"]').click();
    ui.$('[data-book="b"]').click();
    assert(!ui.$("#export-selected").disabled);
    const { PDFDocument } = require("./vendor/pdf-lib.min.js"),
      path = require("node:path");
    const output = process.env.PDF_TEST_OUTPUT;
    if (output) fs.mkdirSync(output, { recursive: true });
    const pages = {};
    for (const content of ["full", "notes"])
      for (const group of ["separate", "combined"]) {
        ui.click("export-selected");
        ui.$('input[name="pdf-content"][value="' + content + '"]').checked =
          true;
        ui.$('input[name="pdf-group"][value="' + group + '"]').checked = true;
        ui.click("selection-pdf-generate");
        await until(() => !ui.$("#selection-pdf-generate").disabled);
        assert(
          !ui.$("#selection-pdf-progress").textContent.includes("interrompu"),
          ui.$("#selection-pdf-progress").textContent,
        );
        const links = [
          ...ui.w.document.querySelectorAll(
            "#selection-pdf-downloads a[download]",
          ),
        ];
        assert.equal(links.length, group === "combined" ? 1 : 2);
        pages[content + "-" + group] = [];
        for (const [i, link] of links.entries()) {
          assert(link.download.includes("bibliotheque-serie"));
          const blob = ui.blobs.get(link.href);
          assert(blob);
          const bytes = await new Promise((resolve, reject) => {
            const r = new ui.w.FileReader();
            r.onload = () => resolve(Buffer.from(r.result));
            r.onerror = reject;
            r.readAsArrayBuffer(blob);
          });
          const pdf = await PDFDocument.load(bytes);
          assert(pdf.getTitle().includes("Bibliothèque série"));
          pages[content + "-" + group].push(pdf.getPageCount());
          assert(pdf.getPageCount() > 0);
          if (output)
            fs.writeFileSync(
              path.join(output, content + "-" + group + "-" + i + ".pdf"),
              bytes,
            );
        }
        ui.click("selection-pdf-cancel");
      }
    for (const content of ["full", "notes"])
      assert.equal(
        pages[content + "-combined"][0],
        pages[content + "-separate"].reduce((a, b) => a + b, 0),
      );
    assert(pages["notes-separate"][1] > 1, "Long notes must paginate");
    assert.equal((await saved(factory)).books.length, 2);
    assert.equal(ui.w.eval("bulkIds.size"), 2);
    ui.click("language-switch");
    ui.click("export-selected");
    assert.equal(ui.$("#selection-pdf-form legend").textContent, "Content");
    assert.equal(ui.$("#selection-pdf-generate").textContent, "Generate PDFs");
    ui.click("selection-pdf-cancel");
    ui.click("language-switch");
    // A large selection exports only the three annotated records. One has
    // text, one embeds an image, and one has an attached image with no text.
    // Covers and whitespace alone must not be treated as annotations.
    const sparse = Array.from({ length: 400 }, (_, i) =>
      C.book({
        id: "sparse-" + i,
        title: "Livre " + String(i).padStart(3, "0"),
        collection: i === 399 ? "Autre" : "Notes",
        notes: " \n ",
      }),
    );
    sparse[0].notes = "Une vraie note.";
    sparse[200].notes = "![Image seule](attachment:only-image)";
    sparse[200].images = [
      { id: "only-image", role: "note", name: "note.png", data: note },
    ];
    sparse[399].images = [
      { id: "attached", role: "note", name: "note.png", data: note },
    ];
    sparse[1].images = [
      { id: "cover-only", role: "cover", name: "cover.png", data: cover },
    ];
    assert.deepEqual(
      sparse.filter(C.hasNotes).map((b) => b.id),
      ["sparse-0", "sparse-200", "sparse-399"],
    );
    ui.w.sparseBooks = sparse;
    await ui.w.eval("commit({...state,books:sparseBooks},{history:false})");
    ui.w.render();
    assert.equal(
      ui.$('#navigation [data-scope="notes"] .count').textContent,
      "3",
    );
    assert.equal(ui.$("#stat-notes strong").textContent, "3");
    assert.equal(ui.$("#stat-images strong").textContent, "2");
    ui.$('#navigation [data-scope="notes"]').click();
    assert.equal(ui.w.eval("filtered().length"), 3);
    ui.w.navigateScope("collection:Notes");
    assert.equal(ui.$("#stat-notes strong").textContent, "2");
    ui.click("stat-notes");
    assert.equal(ui.w.eval("filtered().length"), 2);
    ui.$('#navigation [data-scope="all"]').click();
    if (!ui.w.eval("bulkMode")) ui.click("select-books");
    ui.click("select-results");
    assert.equal(ui.w.eval("bulkIds.size"), 400);
    for (const group of ["combined", "separate"]) {
      ui.click("export-selected");
      const radio = ui.$('input[name="pdf-content"][value="notes"]');
      radio.click();
      assert.equal(
        ui.$("#selection-pdf-scope").textContent,
        "3 fiche(s) avec des notes sur 400 sélectionnée(s). Les fiches sans note sont exclues.",
      );
      ui.$('input[name="pdf-group"][value="' + group + '"]').click();
      ui.click("selection-pdf-generate");
      await until(() => !ui.$("#selection-pdf-generate").disabled);
      const links = [
        ...ui.w.document.querySelectorAll(
          "#selection-pdf-downloads a[download]",
        ),
      ];
      assert.equal(
        links.length,
        group === "combined" ? 1 : 3,
        ui.$("#selection-pdf-progress").textContent,
      );
      let count = 0;
      for (const link of links) {
        const bytes = await new Promise((resolve, reject) => {
          const reader = new ui.w.FileReader();
          reader.onload = () => resolve(Buffer.from(reader.result));
          reader.onerror = reject;
          reader.readAsArrayBuffer(ui.blobs.get(link.href));
        });
        count += (await PDFDocument.load(bytes)).getPageCount();
        if (group === "separate")
          assert(/livre-(000|200|399)_/.test(link.download), link.download);
        if (output)
          fs.writeFileSync(
            path.join(output, "sparse-notes-" + group + "-" + count + ".pdf"),
            bytes,
          );
      }
      assert.equal(count, 3, "No empty note pages among 400 selected books");
      ui.click("selection-pdf-cancel");
    }
    assert.equal(
      ui.w.eval("bulkIds.size"),
      400,
      "Export preserves the selection",
    );
    assert.equal(
      (await saved(factory)).books.length,
      400,
      "Export leaves the library unchanged",
    );
    ui.click("clear-selection");
    ui.$('[data-book="sparse-1"]').click();
    ui.click("export-selected");
    ui.$('input[name="pdf-content"][value="notes"]').click();
    assert(ui.$("#selection-pdf-generate").disabled);
    assert.equal(
      ui.$("#selection-pdf-scope").textContent,
      "Aucune note à exporter dans cette sélection.",
    );
    ui.$("#selection-pdf-form").dispatchEvent(
      new ui.w.Event("submit", { cancelable: true }),
    );
    assert.equal(ui.$("#selection-pdf-downloads").children.length, 0);
    ui.$('input[name="pdf-content"][value="full"]').click();
    assert(
      !ui.$("#selection-pdf-generate").disabled,
      "Cover-only full record remains exportable",
    );
    ui.click("selection-pdf-cancel");
    ui.click("language-switch");
    ui.click("export-selected");
    ui.$('input[name="pdf-content"][value="notes"]').click();
    assert.equal(
      ui.$("#selection-pdf-scope").textContent,
      "There are no notes to export in this selection.",
    );
    await assert.rejects(
      ui.w.eval("LibraryPDF.create([state.books[1]],state.palette,true)"),
      /There are no notes/,
    );
    assert.deepEqual(
      ui.errors.map((e) => e.message),
      [],
    );
    console.log(
      "PASS: title/year sorting, covers/metadata, name persistence, four PDF variants, image-only annotation counts, 400 selected books → 3 note PDFs/pages, empty export guard and FR/EN. Pages:",
      JSON.stringify(pages),
    );
  } finally {
    ui.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
