/* Offline PDF export. pdf-lib is distributed under its MIT license in vendor/. */
const LibraryPDF = {
  async create(
    book,
    palette,
    notesOnly = false,
    libraryName = "",
    labels = (value) => value,
  ) {
    const { PDFDocument, rgb, degrees } = PDFLib,
      C = LibCore,
      pdf = await PDFDocument.create();
    pdf.setTitle(
      (libraryName ? libraryName + " - " : "") +
        book.title +
        (notesOnly ? " - Notes" : I18n.t(" - Fiche complète")),
    );
    pdf.setAuthor(libraryName || I18n.t("Bibliothèque"));
    pdf.setCreator(I18n.t("Bibliothèque"));
    pdf.registerFontkit(fontkit);
    const [regular, bold] = await Promise.all(
      PDF_FONTS.map((f) => pdf.embedFont(f, { subset: true })),
    );
    const fonts = [regular, bold, regular, bold];
    const density = 0.8; // Compact content; A4 page and outer margins remain unchanged.
    const W = 595.28,
      H = 841.89,
      M = 48,
      width = W - 2 * M,
      ink = rgb(0.12, 0.16, 0.18),
      accent = rgb(0, 0.302, 0.396);
    let page, y;
    const canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d");
    function color(css, fallback = ink) {
      if (!css) return fallback;
      ctx.fillStyle = "#20333b";
      ctx.fillStyle = css;
      const s = ctx.fillStyle;
      if (s[0] === "#")
        return rgb(
          parseInt(s.slice(1, 3), 16) / 255,
          parseInt(s.slice(3, 5), 16) / 255,
          parseInt(s.slice(5, 7), 16) / 255,
        );
      const m = s.match(/[\d.]+/g);
      return m ? rgb(+m[0] / 255, +m[1] / 255, +m[2] / 255) : fallback;
    }
    function newPage() {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
    function room(height) {
      if (y - height < M + 24) newPage();
    }
    function font(s) {
      return fonts[(s.bold ? 1 : 0) + (s.italic ? 2 : 0)];
    }
    function measure(t, s) {
      try {
        return font(s).widthOfTextAtSize(t, s.size);
      } catch {
        ctx.font =
          (s.italic ? "italic " : "") +
          (s.bold ? "bold " : "") +
          s.size +
          "px Arial";
        return ctx.measureText(t).width;
      }
    }
    async function draw(t, x, baseline, s) {
      if (!t) return;
      try {
        page.drawText(t, {
          x,
          y: baseline,
          size: s.size,
          font: font(s),
          ySkew: degrees(s.italic ? 12 : 0),
          color: color(s.color),
        });
      } catch {
        const scale = 3,
          w = Math.ceil(measure(t, s)),
          h = Math.ceil(s.size * 1.5);
        canvas.width = Math.max(1, w * scale);
        canvas.height = h * scale;
        ctx.font =
          (s.italic ? "italic " : "") +
          (s.bold ? "bold " : "") +
          s.size * scale +
          "px Arial";
        ctx.fillStyle = s.color || "#20333b";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(t, 0, s.size * scale);
        const im = await pdf.embedPng(canvas.toDataURL("image/png"));
        page.drawImage(im, {
          x,
          y: baseline - (h - s.size),
          width: w,
          height: h,
        });
      }
    }
    async function text(runs, size = 11, indent = 0, gap = 8) {
      size *= density;
      indent *= density;
      gap *= density;
      let line = [],
        used = 0;
      const max = width - indent;
      async function flush() {
        if (!line.length) return;
        const height = Math.max(...line.map((r) => r.s.size)) * 1.5;
        room(height);
        let x = M + indent;
        for (const r of line) {
          if (r.s.bg)
            page.drawRectangle({
              x,
              y: y - r.s.size * 0.24,
              width: r.w,
              height: r.s.size * 1.2,
              color: color(r.s.bg),
            });
          await draw(r.t, x, y, r.s);
          if (r.s.underline)
            page.drawLine({
              start: { x, y: y - 1.5 },
              end: { x: x + r.w, y: y - 1.5 },
              thickness: 0.5,
              color: color(r.s.color),
            });
          x += r.w;
        }
        y -= height;
        line = [];
        used = 0;
      }
      for (const r of runs) {
        const s = { size, ...r };
        for (let part of r.text.replace(/\s+/g, " ").split(/(\s+)/)) {
          if (!part) continue;
          const blank = /^\s+$/.test(part);
          if (blank && !line.length) continue;
          let w = measure(part, s);
          if (used + w > max && line.length) await flush();
          if (blank && !line.length) continue;
          if (w > max) {
            for (const ch of part) {
              const cw = measure(ch, s);
              if (used + cw > max) await flush();
              line.push({ t: ch, w: cw, s });
              used += cw;
            }
          } else {
            line.push({ t: part, w, s });
            used += w;
          }
        }
      }
      await flush();
      y -= gap;
    }
    async function plain(t, size = 11, opts = {}) {
      await text([{ text: String(t), ...opts }], size);
    }
    async function image(data, caption = "", cover = false) {
      let im;
      if (/^data:image\/jpe?g;/i.test(data)) im = await pdf.embedJpg(data);
      else if (/^data:image\/png;/i.test(data)) im = await pdf.embedPng(data);
      else {
        const el = await new Promise((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () =>
            reject(Error(I18n.t("Une image du PDF ne peut pas être lue.")));
          i.src = data;
        });
        const c = document.createElement("canvas");
        c.width = el.naturalWidth;
        c.height = el.naturalHeight;
        c.getContext("2d").drawImage(el, 0, 0);
        im = await pdf.embedPng(c.toDataURL("image/png"));
      }
      const scale =
          Math.min(
            (cover ? 160 : width) / im.width,
            (cover ? 210 : 560) / im.height,
            1,
          ) * density,
        w = im.width * scale,
        h = im.height * scale;
      room(h + 34 * density);
      page.drawImage(im, {
        x: M + (width - w) / 2,
        y: y - h,
        width: w,
        height: h,
      });
      y -= h + 14 * density;
      if (caption) await plain(caption, 9, { italic: true, color: "#56656c" });
      y -= 8 * density;
    }
    function runs(node, style = {}) {
      if (node.nodeType === 3) return [{ text: node.textContent, ...style }];
      if (node.nodeType !== 1) return [];
      const tag = node.tagName,
        next = { ...style };
      if (["B", "STRONG"].includes(tag)) next.bold = true;
      if (["I", "EM"].includes(tag)) next.italic = true;
      if (tag === "U" || tag === "A") next.underline = true;
      if (node.style.color) next.color = node.style.color;
      if (node.style.backgroundColor) next.bg = node.style.backgroundColor;
      return [...node.childNodes].flatMap((n) => runs(n, next));
    }
    newPage();
    await plain(
      notesOnly ? I18n.t("NOTES DE LECTURE") : I18n.t("FICHE DU LIVRE"),
      9,
      {
        bold: true,
        color: "#004d65",
      },
    );
    y -= 8 * density;
    await plain(book.title, 23, { bold: true });
    if (!notesOnly) {
      const cover = book.images.find((im) => im.role === "cover");
      if (cover) await image(cover.data, "", true);
      const rows = [
        [I18n.t("Bibliothèque"), libraryName],
        ["Collection", book.collection],
        [I18n.t("Numéro"), book.number],
        [I18n.t("Auteur(s)"), book.author],
        [I18n.t("Éditeur"), book.publisher],
        [I18n.t("Année / édition"), book.year],
        ["ISBN", book.isbn],
        [I18n.t("Nombre de pages"), book.pages],
        [I18n.t("Langue"), book.language],
        [I18n.t("État"), labels(book.condition)],
        [I18n.t("Étagère"), book.shelf],
        [I18n.t("Emplacement"), book.location],
        ["Type", book.bookType],
        [I18n.t("Lecture"), labels(book.status)],
        [I18n.t("Favori"), book.favorite ? I18n.t("Oui") : I18n.t("Non")],
        [
          I18n.t("Couleurs"),
          (book.colors || [])
            .map((id) => palette.find((p) => p.id === id)?.name || id)
            .join(", "),
        ],
        [I18n.t("Domaines / thématiques"), (book.themes || []).join(", ")],
        [I18n.t("Prêt à"), book.loanName],
        [
          I18n.t("Date de prêt"),
          book.loanDate ? book.loanDate.split("-").reverse().join("/") : "",
        ],
      ];
      for (const [label, value] of rows)
        if (value)
          await text(
            [{ text: label + " : ", bold: true }, { text: String(value) }],
            10,
            0,
            4,
          );
      y -= 12 * density;
      room(50 * density);
      await plain(I18n.t("Mes notes"), 16, { bold: true });
    }
    const root = document.createElement("div");
    root.innerHTML = C.renderNotes(book.notes, book.images);
    const seen = new Set();
    async function block(node) {
      if (node.tagName === "FIGURE") {
        const id = node.querySelector("[data-image]")?.dataset.image,
          im = book.images.find((x) => x.id === id);
        if (im) {
          await image(im.data, im.caption || "");
          seen.add(id);
        }
        return;
      }
      if (node.tagName === "UL") {
        for (const li of node.children)
          await text([{ text: "• " }, ...runs(li)], 11, 12);
        return;
      }
      if (node.classList.contains("note-space")) {
        y -= 7 * density;
        return;
      }
      const heading = /^H[1-6]$/.test(node.tagName);
      if (heading) room(70 * density);
      await text(runs(node, heading ? { bold: true } : {}), heading ? 15 : 11);
    }
    for (const node of root.children) await block(node);
    const detached = book.images.filter(
      (im) => im.role !== "cover" && !seen.has(im.id),
    );
    if (!book.notes.trim() && !detached.length)
      await plain(I18n.t("Aucune note."), 11, { italic: true });
    if (detached.length) {
      room(60 * density);
      await plain(I18n.t("Images jointes"), 14, { bold: true });
      for (const im of detached) await image(im.data, im.caption || im.name);
    }
    const pages = pdf.getPages();
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      p.drawLine({
        start: { x: M, y: 38 },
        end: { x: W - M, y: 38 },
        thickness: 0.5,
        color: rgb(0.8, 0.84, 0.86),
      });
      p.drawText(
        (libraryName || I18n.t("Bibliothèque")) +
          " · " +
          (notesOnly ? "Notes" : I18n.t("Fiche complète")),
        {
          x: M,
          y: 24,
          size: 8,
          font: fonts[0],
          color: accent,
        },
      );
      p.drawText(i + 1 + " / " + pages.length, {
        x: W - M - 35,
        y: 24,
        size: 8,
        font: fonts[0],
        color: ink,
      });
    }
    return pdf.save();
  },
};
