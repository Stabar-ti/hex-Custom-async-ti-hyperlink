/**
 * Editing state for the lore module: which target and entry are open, the draft being
 * edited, and whether it differs from what's saved.
 *
 * This exists to fix a specific bug: the old UI read values straight out of the DOM at save
 * time and had no notion of unsaved work, so loading another entry into the form silently
 * threw away whatever the author had typed. Here the draft is real data, `isDirty()` can be
 * answered at any moment, and panels re-render from `subscribe` instead of poking each
 * other's element IDs.
 *
 * The footer is held two ways at once and they must not disagree:
 *   draft.footerText  — what gets saved; the only thing the bot ever sees
 *   doc               — the structured view the effect rows render
 * `setDoc` is the only path that rewrites footerText, and it sets `touchedDoc`. While that
 * flag is false the original footer string is preserved byte-for-byte, so merely opening an
 * entry never rewrites a GM's hand-authored text (e.g. "!flt +1" -> "!fleet +1").
 */

import { createLoreEntry } from './loreCore.js';
import { parseFooterDoc, serializeFooterDoc } from './loreFooterModel.js';

const state = {
    ref: null,           // {kind:'system'|'planet'|'phase', hexLabel?, planetIndex?, phase?}
    index: -1,           // index into the target's entry list; -1 = composing a new entry
    draft: null,         // the entry being edited
    baseline: null,      // the entry as last saved, for the dirty comparison
    doc: null,           // structured footer view of draft.footerText
    touchedDoc: false,   // has the footer been edited structurally?
    clipboard: null      // one full entry, shared with the map overlay
};

let listeners = [];

export function subscribe(fn) {
    listeners.push(fn);
    return () => { listeners = listeners.filter(l => l !== fn); };
}

function notify() {
    for (const fn of listeners.slice()) fn(state);
}

export function getState() {
    return state;
}

export function getRef() { return state.ref; }
export function getIndex() { return state.index; }
export function getDraft() { return state.draft; }
export function getDoc() { return state.doc; }

/** True once the author has changed anything about the open entry. */
export function isDirty() {
    if (!state.draft || !state.baseline) return false;
    return JSON.stringify(state.draft) !== JSON.stringify(state.baseline);
}

/** True when the open footer can't be edited structurally and must stay raw text. */
export function isFooterUnsafe() {
    return !!state.doc?.unsafe;
}

export function setTarget(ref) {
    state.ref = ref;
    notify();
}

function open(index, entry) {
    state.index = index;
    state.draft = { ...entry };
    state.baseline = { ...entry };
    state.doc = parseFooterDoc(entry.footerText || '');
    state.touchedDoc = false;
    notify();
}

/** Load an existing entry into the form. Callers must commit or discard first. */
export function loadEntry(index, entry) {
    open(index, entry);
}

/** Start composing a new entry, optionally seeded (e.g. with the target's default trigger). */
export function startNew(defaults = {}) {
    open(-1, createLoreEntry(defaults));
}

/** Change non-footer fields (text, receiver, trigger, rounds, tag…). */
export function patchDraft(partial) {
    if (!state.draft) return;
    Object.assign(state.draft, partial);
    notify();
}

/**
 * Replace the structured footer. This is the only path that rewrites draft.footerText,
 * and it is what makes the rewrite deliberate rather than a side effect of opening an entry.
 */
export function setDoc(doc) {
    if (!state.draft) return;
    state.doc = doc;
    state.touchedDoc = true;
    state.draft.footerText = serializeFooterDoc(doc);
    notify();
}

/** Raw-text escape hatch: adopt a hand-edited footer and re-derive the structured view. */
export function setRawFooter(footerText) {
    if (!state.draft) return;
    state.draft.footerText = footerText;
    state.doc = parseFooterDoc(footerText);
    state.touchedDoc = true;
    notify();
}

/**
 * The entry to persist. When the footer was never touched structurally the original string
 * is already in draft.footerText untouched, so this is just the draft.
 */
export function entryToSave() {
    return state.draft ? { ...state.draft } : null;
}

/** Called after a successful save: the draft becomes the new baseline. */
export function markSaved(index, savedEntry) {
    state.index = index;
    if (savedEntry) {
        state.draft = { ...savedEntry };
        state.doc = parseFooterDoc(savedEntry.footerText || '');
    }
    state.baseline = { ...state.draft };
    state.touchedDoc = false;
    notify();
}

/** Throw away edits and go back to the last saved version. */
export function revert() {
    if (!state.baseline) return;
    open(state.index, state.baseline);
}

/** Nothing is open — used when the target has no entries and none is being composed. */
export function clearEntry() {
    state.index = -1;
    state.draft = null;
    state.baseline = null;
    state.doc = null;
    state.touchedDoc = false;
    notify();
}

// ── clipboard (shared with the map overlay, which used to keep its own) ──

export function setClipboard(entry) {
    state.clipboard = entry ? { ...entry } : null;
    notify();
}

export function getClipboard() {
    return state.clipboard ? { ...state.clipboard } : null;
}

export function hasClipboard() {
    return !!state.clipboard;
}
