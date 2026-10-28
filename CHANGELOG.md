# Changelog

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
