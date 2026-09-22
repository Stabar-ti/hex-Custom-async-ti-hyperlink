// @ts-check
// ─────────────────────────────────────────────────────────────────────────────
// editorRef.js — where the one HexEditor lives.
//
// There is exactly one editor in this app. main.js builds it and 132 call sites
// across fourteen files need it, almost none of which are handed one: they are
// popup handlers, menu callbacks and deep helpers inside the Milty designer,
// several frames below anything that ever saw the editor.
//
// They used to read `window.editor`. This module is the same singleton without
// the global: importable, so checkJs can type it and a test can set it; not
// writable by anything outside the app; and named, so the dependency shows up
// in an import list rather than materialising out of the browser namespace.
//
// It is deliberately not the end state. The rest of the repo — 72 modules —
// takes `editor` as a parameter, which is the better answer because it makes a
// function say what it needs. Replacing a `getEditor()` with a parameter is a
// local change once a function has one to pass, so this is the shape that lets
// that happen a file at a time instead of in one large rewrite of untested UI.
//
// Prefer a parameter when you have one. Reach for `getEditor()` when you are
// somewhere that genuinely cannot be handed the editor.
// ─────────────────────────────────────────────────────────────────────────────

/** @type {any} */
let current = null;

/**
 * Publish the editor. Called once, by main.js, as soon as it is constructed.
 *
 * @param {any} editor
 */
export function setEditor(editor) {
    current = editor;
}

/**
 * The editor, or null before main.js has built it.
 *
 * Null rather than a throw: plenty of callers already guard with `?.` because
 * they can run during startup, and turning that into an exception would change
 * behaviour at exactly the moment it is hardest to debug.
 *
 * From the browser console, where there is no import scope:
 *
 *     const { getEditor } = await import('/src/core/editorRef.js');
 *     getEditor().hexes;
 *
 * @returns {any}
 */
export function getEditor() {
    return current;
}

/** Drop the reference. Tests only. */
export function _resetForTests() {
    current = null;
}
