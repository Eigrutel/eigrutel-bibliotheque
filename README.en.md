# Library 1.2.1

An offline personal book library, available in French and English. It supports collections, covers, illustrated notes, loans, filters, bulk editing and PDF exports. No personal books or images are bundled.

[Documentation française](README.md)

## Getting started

The release archive root contains `index.html` (bilingual introduction), `bibliotheque.html` (the standalone French / English app with a language switch), and `source.zip` (corresponding source). The app embeds all runtime scripts and PDF fonts.

Upload the ready-to-use files to an HTTPS static host; a rebuild also generates them in `dist/`. No application server, account or CDN is required. The package is `eigrutel-bibliotheque`, the app file is `bibliotheque.html`, and its iOS home-screen name is `bibliotheque`. Direct HTML opening depends on browser support; storage for `file://` pages varies. On iPad, use Safari with an HTTPS host. Keep a JSON backup before moving the app or changing browsers or domains.

A new installation starts empty. The sidebar accepts a library name; it appears in JSON and PDF filenames and metadata. Add a book and type a collection name, or import a JSON backup. JSON records without a Collection column are left unassigned and can be grouped through bulk editing. Existing 0.x browser libraries are retained without inserting any bundled collection.

Browser storage belongs to the site's origin (protocol, host and port). Both interface languages share the same application and IndexedDB database. There is no cross-device sync or remote book storage. JSON backups include the images currently in the library, notes and settings. Backups are not encrypted.

Import defaults to adding new records without overwriting existing ones. Other choices update matching records or restore the library/collection from the file. JSON matching uses record IDs, not titles. Distinct copies can have the same title. The previous state is kept to undo the latest import on the same device.

## Optional Que sais-je cover style

`LibCore.isQueSaisJe(name)` enables three equal vertical bands: colour, white, colour. Matching ignores case, accents, whitespace, common hyphens and question marks. Examples: `que sais-je`, `Que sais-je?`, `QUE SAIS-JE ?`, `Que sais je`.

This rule changes only the generated cover style. It never creates records or changes the collection name. A supplied cover image takes priority. Other collections retain solid-colour generated covers.

## Building and testing

Requires Node.js 20+ and npm:

```sh
npm ci
npm run build
npm test
```

The build produces one bilingual self-contained page and a source ZIP. `npm run format` formats source files. The package is not intended for the npm registry.

- `core.js`: model, validation, imports, merge modes, filters, notes and cover matching.
- `app.js`: interface, local persistence, transactions, selection and forms.
- `template.html`: HTML structure and responsive CSS.
- `pdf-export.js`: local A4 PDF generation with compact 80% content sizing.
- `locales/en.json`: English display-string catalogue.
- `i18n.js`: runtime FR/EN dictionary. Switching updates the active interface without page reloads or decompression, retaining filters, selections, drafts and undo history.
- `build.cjs`: offline assembly and source packaging.
- `test*.cjs`: synthetic, reproducible tests with no personal exports.
- `vendor/`: PDF libraries, fonts and licence notices.

Both languages use the unchanged `eigrutel-bibliotheque` JSON format, schema version 1. Saved condition and reading-status enum values remain French for compatibility; their display labels follow the selected interface language. Free text and custom colour names remain unchanged. Only error messages are translated inside the core module. New interface strings need exact catalogue entries and checks in both languages.

Undo and Redo restore up to 30 recent changes during the session, including group moves to the trash. Ctrl/Cmd+Z and Ctrl/Cmd+Y also work outside text fields. Revisions prevent silent overwrites between tabs. Record editing uses detached drafts. Bulk changes pass through an explicit field allowlist. Notes are escaped before supported markup is rendered.

## Verification and release

The local suite covers synthetic JSON backups and imports, preserved image bytes, distinct copies, merge modes, isolated collection restore, rich notes, metadata, loans, bulk changes, an empty initial state, cover-name variants, FR/EN backup compatibility and generated JavaScript syntax.

Language-switch regression checks cover repeated FR/EN changes, static labels, preference storage, blocked storage and preservation of drafts, selection and undo history. Browser visual verification of this fix was unavailable in the delivery environment; touch gestures and downloads still require a final acceptance check on a physical iPad.

The release archive is a clean snapshot, suitable as a new repository root. It excludes Git history, private hosting configuration, personal exports and site IDs.

Code: GNU AGPL-3.0-or-later (`LICENSE`). Documentation and templates: CC BY-SA 4.0 (`LICENSE-DOCS.txt`). Eigrutel names and logos are reserved. Imported content retains its own rights. Third-party notices are documented in `THIRD-PARTY.md` and `vendor/`.


## 1.0.1 fix

Book returned in a saved record immediately saves an empty borrower and loan date. In the editor, Clear date and Book returned: clear loan change the draft; Save record commits it.

Every JSON, collection and PDF export awaits the library name save, including immediate clicks and keyboard shortcuts. Importing into an unnamed library adopts the backup name.

`test-workflows.cjs` executes the delivered HTML using jsdom and fake-indexeddb: loan clearing, saving, reopening, reloading, export names, import and trash. PDF rendering alone is stubbed in the filename check. This simulation does not replace physical iPad verification. Version 1.2.1 is displayed in the user guide.

## Images and backups, version 1.2.1

New covers are optimised to at most 600 px high (also 960 px wide for panoramas); note images to 1,600 px on the longest side. Small images are never enlarged. PNG, WebP and JPEG candidates are compared where appropriate, preserving transparency. Larger results are rejected. GIF and animated PNG/WebP images remain unchanged. Copies already optimised at the required dimensions are not recompressed. The editor shows before/after sizes; JSON backups contain the optimised copies, not originals.

Existing and JSON-imported images can be processed from **Optimise images** in the sidebar. **Calculate savings** prepares a preview without changing the library. **Replace images** applies the result, including images in trash. The notice explains that undo/redo history and the pre-import snapshot are cleared to avoid hidden original copies. Unreadable images are retained and reported. Existing downloaded backups remain unchanged.

The JSON schema remains compatible, with the existing 150 MB import limit. Optimisation does not guarantee that a library will fit under that limit. Processing is sequential. Encoding tests use synthetic images; interface checks use a simulated DOM and IndexedDB. Physical iPad testing remains to be done.

## Duplicate a book

**Duplicate**, next to **Edit**, opens an editable copy. It keeps all fields, notes and images and adds “(copy)” to the title. The book and its images receive new IDs, with embedded note references updated to match. The original is unchanged. **Save book** adds the new entry; **Cancel** creates nothing. Duplication is available for books outside the trash.

In selection mode, **Duplicate** appears between **Remove** and **Edit selection**. It adds one copy per selected book and selects the copies for immediate bulk editing. The group is a single Undo/Redo action, subject to the usual history limits.
