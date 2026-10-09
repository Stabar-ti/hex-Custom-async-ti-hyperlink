// @ts-check
/**
 * The clipboard: what you have copied, and what happens when you paste it.
 *
 * The wizard this replaces had no clipboard. It had a mode — you pressed Copy, it took the
 * map away from you, you selected, it went to paste mode, you pasted, and it was over.
 * Copying a second thing threw the first away, there was nothing to look at in between,
 * and every step was announced in a floating window over the tiles you were choosing.
 *
 * Here the clipboard is data that outlives the gesture. Copy captures the selection and
 * pushes a clip; the clip stays until it falls off the end of the history. Pasting does
 * not consume it, so the same block can go down as many times as you like, and copying
 * something else does not lose the last one.
 *
 * The history is the scaffolding for the inspector panel that will list it. Nothing in
 * here draws anything; the ghost and the shortcuts are separate, and both read this.
 *
 * Rotation lives on the clip rather than on a pending paste, so what the ghost shows is
 * what will land, and a clip you turned stays turned when you come back to it. Six turns
 * of 60 degrees is the identity, so nothing is lost by it.
 */

import {
    captureTiles, applyTiles, clearTiles, rotateTiles, pasteTargets, isEmptyHex,
    refreshAfterPaste, DEFAULT_COPY_OPTIONS,
} from './tileClipboardEngine.js';

/** Fired on `document` whenever the clips or the active clip change. */
export const CLIPBOARD_CHANGED = 'ti4:clipboard-changed';

/**
 * How many clips to keep. Enough to cover "I copied three things and want the first one
 * back"; not so many that the panel listing them becomes its own scrolling problem.
 */
export const MAX_CLIPS = 12;

/**
 * @typedef {{
 *   id: string,
 *   tiles: any[],
 *   origin: {q: number, r: number},
 *   labels: string[],
 *   cut: boolean,
 *   at: number,
 *   summary: string,
 * }} Clip
 */

// ── What a copy takes with it ────────────────────────────────────────────────
//
// The wizard had these as four checkboxes in a popup, hung off window.tileCopyOptions.
// They went when the popup did, and everything was included by default — which is what
// the defaults already were, but it did remove a choice. They live here now, where the
// copy that reads them is, and they persist: it is a preference about how you work, not
// about one copy.

const COPY_OPTIONS_KEY = 'ti4-copy-options';

/** Fired when a copy option is switched, so the rail can follow it. */
export const COPY_OPTIONS_CHANGED = 'ti4:copy-options-changed';

/** The four things a copy may leave behind, in the order the rail lists them. */
export const COPY_OPTION_KEYS = Object.freeze(['wormholes', 'customAdjacents', 'borderAnomalies', 'tokens']);

/** @type {Record<string, boolean>} */
let copyOpts = { ...DEFAULT_COPY_OPTIONS };

try {
    const saved = JSON.parse(localStorage.getItem(COPY_OPTIONS_KEY) || 'null');
    if (saved && typeof saved === 'object') {
        for (const k of COPY_OPTION_KEYS) if (k in saved) copyOpts[k] = !!saved[k];
    }
} catch { /* private mode, or a value from an older shape — the defaults stand */ }

/** @returns {Record<string, boolean>} */
export function copyOptions() {
    return { ...copyOpts };
}

/** @param {string} key @param {boolean} on */
export function setCopyOption(key, on) {
    if (!COPY_OPTION_KEYS.includes(key)) return;
    copyOpts[key] = !!on;
    try {
        localStorage.setItem(COPY_OPTIONS_KEY, JSON.stringify(copyOpts));
    } catch { /* the choice just does not survive the session */ }
    document.dispatchEvent(new CustomEvent(COPY_OPTIONS_CHANGED, { detail: copyOptions() }));
}

/** @type {Clip[]} newest first */
let history = [];
/** @type {string|null} */
let activeId = null;

let nextId = 1;

/** @returns {Clip[]} newest first */
export function clips() {
    return history;
}

/** @returns {Clip|null} */
export function activeClip() {
    return history.find(c => c.id === activeId) || null;
}

/** @param {string} id */
export function setActiveClip(id) {
    if (!history.some(c => c.id === id)) return;
    activeId = id;
    announce();
}

/**
 * Drop one clip.
 *
 * If it was the active one, the next newest takes over rather than leaving nothing
 * selected — the panel is a list you pick from, and a pick that empties itself is a worse
 * answer than the obvious neighbour.
 *
 * @param {string} id
 */
export function removeClip(id) {
    const i = history.findIndex(c => c.id === id);
    if (i < 0) return;
    history = history.filter(c => c.id !== id);
    if (activeId === id) activeId = history.length ? history[Math.min(i, history.length - 1)].id : null;
    announce();
}

export function clearClipboard() {
    history = [];
    activeId = null;
    announce();
}

function announce() {
    document.dispatchEvent(new CustomEvent(CLIPBOARD_CHANGED, {
        detail: { clips: history, activeId },
    }));
}

/**
 * A one-line description of a clip, for the history list and the ghost's label.
 *
 * Names what is actually on it rather than counting hexes, because "3 tiles" describes
 * every clip you will ever make and tells you nothing about which one this is.
 *
 * @param {any[]} tiles
 */
function describe(tiles) {
    const real = tiles.filter(t => t?.realId);
    const painted = tiles.filter(t => t && !t.realId && t.baseType);
    const n = tiles.filter(Boolean).length;

    if (real.length === 1 && n === 1) return String(real[0].realId);
    if (real.length) {
        const ids = real.slice(0, 3).map(t => t.realId).join(', ');
        return real.length > 3 ? `${ids} +${real.length - 3}` : ids;
    }
    if (painted.length) {
        const types = [...new Set(painted.map(t => t.baseType))];
        return types.length === 1 ? `${n}× ${types[0]}` : `${n} painted tiles`;
    }
    return `${n} tile${n === 1 ? '' : 's'}`;
}

/**
 * Put the current selection on the clipboard.
 *
 * A cut clears the source immediately rather than on the next paste. That is what Ctrl+X
 * does everywhere else, it makes the clip a piece of data rather than a pending move, and
 * nothing is lost by it: the tiles are on the clipboard, the clear is one undo step, and
 * the clip survives in the history whether or not it is ever pasted.
 *
 * @param {any} editor
 * @param {string[]} labels
 * @param {{cut?: boolean, options?: object}} [opts]
 * @returns {Clip|null}
 */
export function copyTiles(editor, labels, { cut = false, options = null } = {}) {
    const opts = options || copyOptions();
    const present = labels.filter(l => editor?.hexes?.[l]);
    if (!present.length) return null;

    const tiles = captureTiles(editor, present, opts).filter(Boolean);
    if (!tiles.length) return null;

    const first = editor.hexes[present[0]];
    /** @type {Clip} */
    const clip = {
        id: 'clip' + (nextId++),
        tiles,
        origin: { q: first.q, r: first.r },
        labels: present,
        cut,
        at: Date.now(),
        summary: describe(tiles),
    };

    history = [clip, ...history].slice(0, MAX_CLIPS);
    activeId = clip.id;

    if (cut) {
        editor.beginUndoGroup?.();
        clearTiles(editor, present);
        editor.commitUndoGroup?.();
        refreshAfterPaste(editor);
    }

    announce();
    return clip;
}

/**
 * Turn the active clip 60 degrees.
 * @param {any} editor
 * @param {1|-1} dir
 */
export function rotateActiveClip(editor, dir) {
    const clip = activeClip();
    if (!clip) return;
    rotateTiles(editor, clip.tiles, clip.origin, dir);
    announce();
}

/**
 * Where a clip would land if pasted with its origin on `destLabel`.
 *
 * @param {any} editor
 * @param {string} destLabel
 * @param {Clip|null} [clip]
 * @returns {{dq: number, dr: number, targets: string[], overwrites: string[]}|null}
 */
export function pastePlan(editor, destLabel, clip = activeClip()) {
    const dest = editor?.hexes?.[destLabel];
    if (!clip || !dest) return null;

    const dq = dest.q - clip.origin.q;
    const dr = dest.r - clip.origin.r;
    const targets = pasteTargets(editor, clip.tiles, dq, dr);
    const overwrites = targets.filter(l => !isEmptyHex(editor.hexes[l]));
    return { dq, dr, targets, overwrites };
}

/**
 * Paste the active clip with its origin on `destLabel`.
 *
 * Pasting does not consume the clip — placing the same block in several places is the
 * ordinary case, not an edge one.
 *
 * @param {any} editor
 * @param {string} destLabel
 * @param {{confirmOverwrite?: (labels: string[]) => boolean}} [opts]
 * @returns {boolean} whether anything was written
 */
export function pasteAt(editor, destLabel, { confirmOverwrite } = {}) {
    const clip = activeClip();
    const plan = pastePlan(editor, destLabel, clip);
    if (!clip || !plan || !plan.targets.length) return false;

    if (plan.overwrites.length && confirmOverwrite && !confirmOverwrite(plan.overwrites)) {
        return false;
    }

    editor.beginUndoGroup?.();
    applyTiles(editor, clip.tiles, plan.dq, plan.dr);
    editor.commitUndoGroup?.();
    refreshAfterPaste(editor);
    return true;
}

/** Test seam: forget everything, including the id counter and the copy options. */
export function _resetForTests() {
    history = [];
    activeId = null;
    nextId = 1;
    copyOpts = { ...DEFAULT_COPY_OPTIONS };
}
