/** One offline bilingual application, built from one template and one dictionary. */
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const C = require("./core.js");
const read = (file) => fs.readFileSync(file, "utf8");
const inline = (value) => value.replace(/<\/script/gi, "<\\/script");
const seed = C.emptyLibrary();
const values = {
  I18N: read("i18n.js").replace("__CATALOG__", () =>
    JSON.stringify(require("./locales/en.json")).replace(/</g, "\\u003c"),
  ),
  CORE: read("core.js"),
  APP: read("app.js"),
  IMAGEOPTIMIZER: read("image-optimizer.js"),
  PDFEXPORT: read("pdf-export.js"),
  PDFLIB: read("vendor/pdf-lib.min.js"),
  FONTKIT: read("vendor/fontkit.min.js"),
  PDFFONTS: JSON.stringify(
    ["vendor/DejaVuSans.ttf", "vendor/DejaVuSans-Bold.ttf"].map((p) =>
      fs.readFileSync(p).toString("base64"),
    ),
  ),
  SEED: JSON.stringify(seed).replace(/</g, "\\u003c"),
};
let html = read("template.html").replace("<!doctype html>", "<!DOCTYPE html>");
for (const [key, value] of Object.entries(values))
  html = html.replace("__" + key + "__", () => inline(value));
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/bibliotheque.html", html);
for (const path of [
  "dist/en.html",
  "dist/bibliotheque-en.html",
  "bibliotheque-en.html",
])
  fs.rmSync(path, { force: true });
fs.copyFileSync("index.html", "dist/index.html");
fs.cpSync("favicon", "dist/favicon", { recursive: true });
fs.copyFileSync("dist/bibliotheque.html", "bibliotheque.html");
fs.rmSync("dist/source.zip", { force: true });
const files = [...new Set(require("./scripts/source-files.cjs"))];
execFileSync("zip", ["-q", "-X", "dist/source.zip", ...files], {
  stdio: "inherit",
});
fs.copyFileSync("dist/source.zip", "source.zip");
console.log(
  `bibliotheque.html: FR/EN dictionary, ${seed.books.length} books, ${Buffer.byteLength(html)} bytes`,
);
