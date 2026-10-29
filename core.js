/* Bibliothèque 1.3.2 | 2026-10-29 | Eigrutel Lab
 * Code: GNU AGPL-3.0-or-later. Docs/models: CC BY-SA 4.0.
 * Eigrutel names and logos reserved. User content retains its own rights.
 */
(function (root) {
  "use strict";
  const tr = (value) => (typeof I18n === "undefined" ? value : I18n.t(value));
  const FORMAT = "eigrutel-bibliotheque";
  // Saved sentinel and enum values are stable across language editions.
  const NO_COLLECTION = "Sans collection";
  const STATUSES = ["À lire", "En cours", "Lu"];
  // Optional cover style: tolerant of case, accents, whitespace, hyphens and ?.
  function isQueSaisJe(name) {
    return norm(name).replace(/[\s?？‐‑–—-]/g, "") === "quesaisje";
  }
  function isPenguin(name) {
    return (
      norm(name)
        .trim()
        .replace(/[\s?？]+/g, "") === "penguin"
    );
  }
  // The historical number field also accepts a subtitle. Its leading number
  // remains the volume order, regardless of the words following it.
  function volumeNumber(value) {
    const match = String(value || "")
      .trim()
      .match(/^(?:(?:n[°ºo.]|no\.|tome|vol(?:ume)?\.?)\s*)?(\d+)/i);
    return match ? Number(match[1]) : null;
  }
  function publicationYear(value) {
    const match = String(value || "")
      .trim()
      .match(/(?:^|\D)(\d{4})(?!\d)/);
    return match ? Number(match[1]) : null;
  }
  function compareBooks(
    a,
    b,
    sort = "title",
    locale = "fr",
    collator = new Intl.Collator(locale, {
      numeric: true,
      sensitivity: "base",
    }),
  ) {
    const title = () => collator.compare(a.title.trim(), b.title.trim());
    const volume = () => {
      const x = volumeNumber(a.number),
        y = volumeNumber(b.number);
      if (x !== null && y !== null)
        return x - y || collator.compare(a.number, b.number);
      if (x !== null) return -1;
      if (y !== null) return 1;
      if (!a.number || !b.number) return a.number ? -1 : b.number ? 1 : 0;
      return collator.compare(a.number, b.number);
    };
    if (sort === "updated")
      return (
        (b.updatedAt || "").localeCompare(a.updatedAt || "") ||
        title() ||
        volume()
      );
    if (sort === "year" || sort === "year-desc") {
      const x = publicationYear(a.year),
        y = publicationYear(b.year);
      return (
        (x === null
          ? y === null
            ? 0
            : 1
          : y === null
            ? -1
            : (x - y) * (sort === "year-desc" ? -1 : 1)) ||
        title() ||
        volume()
      );
    }
    if (sort.startsWith("title"))
      return title() * (sort.endsWith("desc") ? -1 : 1) || volume();
    if (!a.number || !b.number) return a.number ? -1 : b.number ? 1 : title();
    return (volume() || title()) * (sort.endsWith("desc") ? -1 : 1);
  }
  function emptyLibrary() {
    return {
      format: FORMAT,
      schemaVersion: 1,
      libraryName: "",
      books: [],
      palette: clone(PALETTE),
    };
  }

  const PALETTE = [
    { id: ".        .", name: "Bleu", hex: "#8bbfe0" },
    { id: ".              .", name: "Jaune", hex: "#efd170" },
    { id: ".   .", name: "Vert", hex: "#91baa1" },
    { id: ".     .", name: "Rouge", hex: "#db958c" },
    { id: ".  .  .", name: "Violet", hex: "#bd9dd5" },
    { id: ".  .   .", name: "Brun", hex: "#cba88d" },
    { id: ".    .", name: "Orange", hex: "#e5a15d" },
    { id: "…", name: "Gris", hex: "#d5d5d5" },
  ];
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const norm = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const split = (s) =>
    String(s || "")
      .split(/,\s*/)
      .map((x) => x.trim())
      .filter(Boolean);
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++)
      h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0).toString(16);
  }
  function key(b) {
    return JSON.stringify([
      b.title.trim(),
      b.number.trim(),
      [...b.colors].sort(),
      [...b.themes].sort(),
    ]);
  }
  const noteImages = (b) => b.images.filter((im) => im.role !== "cover");
  function book(p = {}) {
    return {
      id:
        p.id ||
        "book_" +
          (globalThis.crypto?.randomUUID?.() ||
            Date.now().toString(36) + Math.random().toString(36).slice(2)),
      title: "",
      number: "",
      collection: "",
      author: "",
      publisher: "",
      year: "",
      isbn: "",
      location: "",
      shelf: "",
      bookType: "",
      condition: "",
      pages: "",
      language: "",
      colors: [],
      themes: [],
      status: "",
      favorite: false,
      loanName: "",
      loanDate: "",
      notes: "",
      images: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...p,
    };
  }
  // A duplicate is an independent draft. Remap embedded image references together.
  function duplicateBook(source) {
    const fresh = book();
    const copy = book({
      ...clone(source),
      id: fresh.id,
      createdAt: fresh.createdAt,
      updatedAt: fresh.updatedAt,
    });
    delete copy.deletedAt;
    const imageIds = new Map();
    copy.images.forEach((image, index) => {
      const id = "img_" + copy.id + "_" + index;
      imageIds.set(image.id, id);
      image.id = id;
    });
    copy.notes = copy.notes.replace(
      /\]\(attachment:([^\)]+)\)/g,
      (match, id) =>
        imageIds.has(id) ? "](attachment:" + imageIds.get(id) + ")" : match,
    );
    return copy;
  }
  function validate(obj, fallbackPalette = PALETTE) {
    if (obj.libraryName !== undefined && typeof obj.libraryName !== "string")
      throw Error("Nom de bibliothèque invalide.");
    const libraryName = String(obj.libraryName || "")
      .trim()
      .slice(0, 80);
    if (
      !obj ||
      obj.format !== FORMAT ||
      obj.schemaVersion !== 1 ||
      !Array.isArray(obj.books)
    )
      throw Error(
        tr(
          "Ce fichier n’est pas une sauvegarde Bibliothèque compatible (version 1).",
        ),
      );
    if (obj.books.length > 50000)
      throw Error(tr("La limite de cette version est de 50 000 fiches."));
    const ids = new Set();
    const books = obj.books.map((b, i) => {
      if (
        !b ||
        typeof b.id !== "string" ||
        !b.id ||
        ids.has(b.id) ||
        typeof b.title !== "string" ||
        !b.title.trim()
      )
        throw Error(
          tr("Fiche invalide ou identifiant en double à la ligne ") + (i + 1),
        );
      ids.add(b.id);
      for (const k of [
        "number",
        "notes",
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
      ])
        if (b[k] !== undefined && typeof b[k] !== "string")
          throw Error(tr("Champ invalide : ") + k);
      if (b.pages && !/^[1-9][0-9]*$/.test(b.pages))
        throw Error(tr("Le nombre de pages doit être un entier positif."));
      if (b.condition && !CONDITIONS.includes(b.condition))
        throw Error(tr("État du livre invalide."));
      if (b.loanDate && !validDate(b.loanDate))
        throw Error(tr("Date de prêt invalide."));
      for (const k of ["colors", "themes"])
        if (!Array.isArray(b[k]) || b[k].some((x) => typeof x !== "string"))
          throw Error(tr("Champ invalide : ") + k);
      if (!Array.isArray(b.images)) throw Error(tr("Images invalides."));
      let images = new Set();
      for (const im of b.images) {
        if (
          !im ||
          typeof im.id !== "string" ||
          images.has(im.id) ||
          typeof im.data !== "string" ||
          !/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(
            im.data,
          )
        )
          throw Error(
            tr("Une image est invalide dans « ") + b.title + tr(" »."),
          );
        images.add(im.id);
      }
      for (const m of (b.notes || "").matchAll(/\]\(attachment:([^\)]+)\)/g))
        if (!images.has(m[1]))
          throw Error(
            tr("Une image citée dans les notes manque dans « ") +
              b.title +
              tr(" »."),
          );
      return book(b);
    });
    const palette = (
      Array.isArray(obj.palette) ? obj.palette : fallbackPalette
    ).map((p) => {
      // Correct the unidentified default from 0.1.0, including older backups.
      // A deliberately renamed/customized repère remains untouched.
      if (p.id === "…" && p.name === "Repère B (à préciser)")
        return { ...p, name: "Gris", unconfirmed: false };
      if (p.id === ".    ." && p.name === "Repère A (à préciser)")
        return { id: p.id, name: "Orange", hex: "#e5a15d" };
      return { ...p };
    });
    if (
      palette.some(
        (p) =>
          typeof p.id !== "string" ||
          typeof p.name !== "string" ||
          !/^#[0-9a-f]{6}$/i.test(p.hex),
      )
    )
      throw Error(tr("Palette invalide."));
    if (
      obj.removedPaletteIds !== undefined &&
      (!Array.isArray(obj.removedPaletteIds) ||
        obj.removedPaletteIds.some((id) => typeof id !== "string"))
    )
      throw Error(tr("Repères retirés invalides."));
    const defined = new Set(palette.map((p) => p.id));
    const removedPaletteIds = [...new Set(obj.removedPaletteIds || [])].filter(
      (id) => !defined.has(id),
    );
    if (obj.exportScope) {
      if (!["library", "collection"].includes(obj.exportScope.kind))
        throw Error(tr("Périmètre de sauvegarde inconnu."));
      if (
        obj.exportScope.kind === "collection" &&
        (typeof obj.exportScope.name !== "string" ||
          !obj.exportScope.name ||
          books.some(
            (b) => (b.collection || "Sans collection") !== obj.exportScope.name,
          ))
      )
        throw Error(
          tr(
            "La sauvegarde de collection contient des fiches d’une autre collection.",
          ),
        );
    }
    return {
      ...obj,
      libraryName,
      books: removeColorAssignments(books, new Set(removedPaletteIds)),
      palette,
      removedPaletteIds,
    };
  }
  // A removed label must also disappear from book assignments, including Trash,
  // otherwise boot would recreate its definition from an orphaned colour ID.
  function removeColorAssignments(books, removed) {
    return books.map((b) =>
      b.colors.some((id) => removed.has(id))
        ? { ...b, colors: b.colors.filter((id) => !removed.has(id)) }
        : b,
    );
  }
  function importPalette(out, incoming) {
    const removed = new Set([
      ...(out.removedPaletteIds || []),
      ...(incoming.removedPaletteIds || []),
    ]);
    // Importing an explicit definition restores that label, including old backups.
    for (const p of incoming.palette || []) removed.delete(p.id);
    out.palette = mergePalette(out.palette, incoming.palette).filter(
      (p) => !removed.has(p.id),
    );
    out.removedPaletteIds = [...removed];
    out.books = removeColorAssignments(out.books, removed);
    return out;
  }
  // Colour labels are library-wide settings. An imported definition replaces
  // the matching ID; local-only labels stay available to existing books.
  function mergePalette(current = [], incoming = []) {
    const imported = new Map(incoming.map((p) => [p.id, p]));
    const localIds = new Set(current.map((p) => p.id));
    return [
      ...current.map((p) => clone(imported.get(p.id) || p)),
      ...incoming.filter((p) => !localIds.has(p.id)).map((p) => clone(p)),
    ];
  }
  function merge(current, incoming, mode = "add") {
    if (mode === "replace") {
      if (incoming.exportScope?.kind === "collection")
        throw Error(
          tr(
            "Ce fichier contient une seule collection. Choisissez « Restaurer cette collection ».",
          ),
        );
      return {
        ...clone(incoming),
        exportScope: { kind: "library" },
        revision: current.revision || 0,
        appliedBundles: [
          ...new Set([
            ...(current.appliedBundles || []),
            ...(incoming.appliedBundles || []),
          ]),
        ],
      };
    }
    if (mode === "replace-collection") {
      const name =
        incoming.exportScope?.kind === "collection"
          ? incoming.exportScope.name
          : null;
      if (!name)
        throw Error(tr("Aucune collection identifiée dans cette sauvegarde."));
      const other = current.books.filter(
          (b) => (b.collection || "Sans collection") !== name,
        ),
        ids = new Set(other.map((b) => b.id));
      if (incoming.books.some((b) => ids.has(b.id)))
        throw Error(
          tr(
            "Un livre de cette sauvegarde appartient maintenant à une autre collection. Utilisez la fusion pour le conserver.",
          ),
        );
      const out = clone(current);
      if (!out.libraryName && incoming.libraryName)
        out.libraryName = incoming.libraryName;
      out.books = [...clone(other), ...clone(incoming.books)];
      return importPalette(out, incoming);
    }
    const out = clone(current);
    if (!out.libraryName && incoming.libraryName)
      out.libraryName = incoming.libraryName;
    const index = new Map(out.books.map((b, i) => [b.id, i]));
    const used = new Set();
    for (const b of incoming.books) {
      let i = index.get(b.id);
      if (i !== undefined) {
        used.add(i);
        if (mode === "update")
          out.books[i] = { ...clone(b), id: out.books[i].id };
      } else {
        index.set(b.id, out.books.length);
        used.add(out.books.length);
        out.books.push(clone(b));
      }
    }
    return importPalette(out, incoming);
  }
  const CONDITIONS = ["Neuf", "Bon état", "Occasion", "Défraîchi"];
  const BULK_FIELDS = [
    "collection",
    "author",
    "publisher",
    "shelf",
    "bookType",
    "year",
    "location",
    "status",
    "colors",
    "themes",
    "favorite",
    "loanName",
    "loanDate",
    "condition",
    "pages",
    "language",
  ];
  function validDate(value) {
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value
    );
  }
  function bulkUpdate(current, ids, patch) {
    if (!ids.length || !Object.keys(patch).length)
      throw Error(tr("Sélectionnez des livres et au moins un champ."));
    for (const k of Object.keys(patch)) {
      if (!BULK_FIELDS.includes(k))
        throw Error(tr("Champ exclu des actions groupées : ") + k);
      if (
        k === "favorite"
          ? typeof patch[k] !== "boolean"
          : ["colors", "themes"].includes(k)
            ? !Array.isArray(patch[k]) ||
              patch[k].some((v) => typeof v !== "string")
            : typeof patch[k] !== "string"
      )
        throw Error(tr("Valeur invalide : ") + k);
    }
    if (patch.loanDate && !validDate(patch.loanDate))
      throw Error(tr("Date de prêt invalide."));
    const selected = new Set(ids),
      out = clone(current),
      now = new Date().toISOString();
    if (
      out.books.filter((b) => selected.has(b.id) && !b.deletedAt).length !==
      selected.size
    )
      throw Error(tr("La sélection contient un livre indisponible."));
    out.books = out.books.map((b) =>
      selected.has(b.id) ? { ...b, ...clone(patch), updatedAt: now } : b,
    );
    return validate(out);
  }
  function collectionBackup(state, name) {
    return validate({
      format: FORMAT,
      schemaVersion: 1,
      libraryName: state.libraryName || "",
      exportScope: { kind: "collection", name },
      exportedAt: new Date().toISOString(),
      books: clone(
        state.books.filter((b) => (b.collection || "Sans collection") === name),
      ),
      palette: clone(state.palette),
      removedPaletteIds: clone(state.removedPaletteIds || []),
    });
  }

  function inlinePlain(s) {
    let t = esc(s)
      .replace(/&lt;u&gt;/g, "<u>")
      .replace(/&lt;\/u&gt;/g, "</u>");

    t = t.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_, l, u) =>
        '<a href="' +
        u +
        '" target="_blank" rel="noopener noreferrer">' +
        l +
        "</a>",
    );
    return t
      .replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }
  function inline(s, depth = 0) {
    if (depth > 12) return inlinePlain(s);
    const pattern = /\[(color|highlight)=(#[0-9a-f]{6})\]([\s\S]*?)\[\/\1\]/gi;
    let out = "",
      last = 0,
      m;
    while ((m = pattern.exec(s))) {
      out += inlinePlain(s.slice(last, m.index));
      const body = inline(m[3], depth + 1);
      out +=
        m[1].toLowerCase() === "color"
          ? '<span style="color:' + m[2] + '">' + body + "</span>"
          : '<mark style="background-color:' +
            m[2] +
            ';color:#202020">' +
            body +
            "</mark>";
      last = pattern.lastIndex;
    }
    return out + inlinePlain(s.slice(last));
  }
  function renderNotes(text, images = []) {
    let list = false;
    const out = [];
    for (const line of text.split(/\r?\n/)) {
      const bullet = /^\s*[-*]\s+(.+)/.exec(line);
      if (bullet) {
        if (!list) {
          out.push("<ul>");
          list = true;
        }
        out.push("<li>" + inline(bullet[1]) + "</li>");
        continue;
      }
      if (list) {
        out.push("</ul>");
        list = false;
      }
      const image = /^!\[([^\]]*)\]\(attachment:([^)]+)\)\s*$/.exec(line);
      if (image) {
        const im = images.find((x) => x.id === image[2]);
        if (im)
          out.push(
            '<figure><button type="button" class="note-image" data-image="' +
              esc(im.id) +
              '"><img loading="lazy" src="' +
              im.data +
              '" alt="' +
              esc(im.caption || image[1]) +
              '"></button>' +
              (im.caption && im.caption !== im.name
                ? "<figcaption>" + esc(im.caption) + "</figcaption>"
                : "") +
              "</figure>",
          );
        continue;
      }
      const h = /^(#{1,4})\s+(.+)/.exec(line);
      if (h) {
        const n = Math.min(4, h[1].length + 1);
        out.push("<h" + n + ">" + inline(h[2]) + "</h" + n + ">");
      } else if (line.trim()) out.push("<p>" + inline(line) + "</p>");
      else out.push('<div class="note-space"></div>');
    }
    if (list) out.push("</ul>");
    return out.join("");
  }
  function matchesFields(b, f) {
    for (const k of [
      "collection",
      "author",
      "publisher",
      "language",
      "condition",
      "location",
      "year",
      "loanName",
    ])
      if (f[k] && (f[k] === "__empty__" ? !!b[k] : b[k] !== f[k])) return false;
    const lent = !!(b.loanName || b.loanDate);
    if ((f.loan === "yes" && !lent) || (f.loan === "no" && lent)) return false;
    if (
      (f.favorite === "yes" && !b.favorite) ||
      (f.favorite === "no" && b.favorite)
    )
      return false;
    if (f.pagesMin && (!b.pages || Number(b.pages) < Number(f.pagesMin)))
      return false;
    if (f.pagesMax && (!b.pages || Number(b.pages) > Number(f.pagesMax)))
      return false;
    if (f.loanFrom && (!b.loanDate || b.loanDate < f.loanFrom)) return false;
    if (f.loanTo && (!b.loanDate || b.loanDate > f.loanTo)) return false;
    return true;
  }
  const api = {
    emptyLibrary,
    isQueSaisJe,
    isPenguin,
    volumeNumber,
    publicationYear,
    compareBooks,
    NO_COLLECTION,
    STATUSES,
    matchesFields,
    CONDITIONS,
    bulkUpdate,
    BULK_FIELDS,
    validDate,
    noteImages,
    FORMAT,
    PALETTE,
    clone,
    norm,
    split,
    esc,
    hash,
    key,
    book,
    duplicateBook,
    validate,
    merge,
    collectionBackup,
    renderNotes,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.LibCore = api;
})(typeof window !== "undefined" ? window : globalThis);
