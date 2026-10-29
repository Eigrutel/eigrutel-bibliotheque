# Changelog

## 1.3.2 - 2026-10-29

- Remove colour labels with a cross in the palette editor; used labels show the affected-book count before removal.
- Save applies palette removals and book assignments together; Cancel discards them and Undo/Redo reverses the saved operation.
- JSON backups retain removed label IDs so a transfer to another device does not recreate them. Explicit definitions in an older backup can restore a label.


## 1.3.1 - 2026-10-29

- JSON imports restore saved colour-label names and colours even when their IDs already exist on the destination device. Full and collection backups include the complete palette.
- Add/update/collection imports retain local-only labels; legacy files without a palette retain the current palette.
- Palette Save reads the final displayed values and waits for pending library-name saves.
- Short Year ↑ / Year ↓ sort choices, with unknown years last in both directions.


## 1.3.0 - 2026-10-29

- Compact single-line collection heading above phone controls.
- Penguin automatic covers use a white middle horizontal third.
- Natural volume ordering for matching titles and chronological publication-year sorting, with missing years last.
- Combined No. and subtitle field; compact title, volume/subtitle and author metadata below covers.
- Library-name autosave, pending-edit recovery and protection against stale metadata in unrelated saves and Undo/Redo.
- Selected full-record or notes-only PDFs: one combined document with continuous pagination, or a separate download per book.

## 1.2.1 - 2026-10-29

- Added Duplicate between Remove and Edit selection, for one or more selected books.
- Copies become the new selection and share one Undo/Redo action.

## 1.2.0 - 2026-10-29

- Cover optimisation reduced to 600 px high (60% of the previous dimensions), with a 960 px width limit. Note images keep their 1,600 px limit.
- Duplicate an existing book into an independent editable draft, including metadata, notes and images. Saving adds the copy; cancelling adds nothing.
- Existing optimised covers can be reduced again through the image optimisation tool.

## 1.1.0 — 2026-10-29

- Automatic optimisation of newly added covers and note images, without upscaling.
- Existing-library optimisation with size preview, cancellation and explicit replacement.
- Transparent images retained; GIF and PNG/WebP animations kept intact; larger outputs rejected.
- JSON image IDs and note links preserved; new tests cover actual encoding and the delivered HTML.
- Supplied favicon and introduction page integrated.

## 1.0.1 — 2026-10-28

- Library naming is serialized and awaited by every export, including immediate clicks and keyboard shortcuts.
- Name controls stay in sync after import, undo and redo.
- Clear-loan actions reset the native date control; Book returned saves the return directly from a record.
- Regression checks execute the delivered HTML with DOM and IndexedDB simulation.

## 1.0.0 — 2026-10-28

- Empty installation; no bundled personal collections, books, notes or covers.
- Existing browser libraries and schema-version-1 JSON backups remain compatible.
- Optional Que sais-je cover treatment based on a normalized collection name.
- One bilingual HTML application with a runtime FR/EN dictionary, including help and PDF labels.
- Language switching no longer reloads or decompresses a second document; drafts, filters, selection and undo history stay in memory.
- Switching works even when browser preference storage is unavailable.
- Formatted and commented sources, documented offline build and dependency lockfile.
- Synthetic import and release tests replace tests tied to personal JSON exports.
- Source and third-party licence files included for redistribution.

## 0.x

Private development versions with personal demonstration collections. Their datasets and Git history are excluded from this release snapshot.
