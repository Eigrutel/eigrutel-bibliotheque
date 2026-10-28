/** Explicit allowlist: private hosting files and personal datasets cannot enter a release. */
const fs = require("node:fs");
const sourceFiles = [
  ".gitignore",
  "package.json",
  "package-lock.json",
  "build.cjs",
  "app.js",
  "i18n.js",
  "core.js",
  "pdf-export.js",
  "template.html",
  "favicon/favbibli.png",
  "index.html",
  "README.md",
  "README.en.md",
  "CHANGELOG.md",
  "THIRD-PARTY.md",
  "LICENSE",
  "LICENSE-DOCS.txt",
  "test.cjs",
  "test-bulk.cjs",
  "test-fields.cjs",
  "test-release.cjs",
  "test-i18n.cjs",
  "test-workflows.cjs",
];
for (const dir of ["scripts", "locales", "vendor", "favicon"])
  for (const name of fs.readdirSync(dir).sort())
    sourceFiles.push(dir + "/" + name);
module.exports = sourceFiles;
