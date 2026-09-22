// @ts-check
/**
 * Keeping the map across a reload.
 *
 * The editor threw your work away on every page load and drew a fresh six-ring grid. That
 * is the right thing for a demo and the wrong thing for a tool: a refresh, a crash, a
 * closed tab or an accidental navigation all cost you everything, and the only defence was
 * remembering to press Save map locally often enough.
 *
 * So the map is written to localStorage as you work and read back at startup. It is the
 * same serialisation that Save map locally produces — exportFullState and importFullState,
 * already the most exercised pair of functions in the project — rather than a second
 * format that would drift from it.
 *
 * Three things this deliberately does not do:
 *
 *   - It is not a replacement for saving a file. localStorage is per-browser, per-origin,
 *     and a cleared cache takes it with no warning. It is a safety net, not a home.
 *   - It does not keep a history of sessions. One slot, the current map.
 *   - It does not store the view. Zoom and pan are where you left the camera, not what you
 *     were building, and a restored map fits itself to the window, which is the more
 *     useful answer on a different screen.
 */

import { exportFullState } from '../data/export.js';
import { importFullState } from '../data/import.js';
import { HISTORY_CHANGED } from './history.js';

const KEY = 'ti4-session';

/**
 * How long to wait after the last change before writing.
 *
 * Every hex edit announces a history change, and a bulk fill announces a hundred in a few
 * milliseconds. Serialising the whole map on each one would make the AutoMapper feel
 * broken; a second and a half after things go quiet costs nothing and writes once.
 */
const DEBOUNCE_MS = 1500;

/** Set once the browser has told us there is no room, so we stop trying every edit. */
let storageFull = false;

/**
 * Write the map to localStorage.
 *
 * @param {any} editor
 * @returns {boolean} whether it was written
 */
export function saveSession(editor) {
    if (!editor || storageFull) return false;
    try {
        localStorage.setItem(KEY, exportFullState(editor));
        return true;
    } catch (err) {
        // Quota, or storage disabled entirely. Either way, stop asking: the map is intact,
        // only the safety net is gone, and the user needs to hear that once rather than on
        // every keystroke.
        storageFull = true;
        console.warn('[session] the map could not be saved to this browser:', err);
        const half = document.getElementById('statusHex');
        if (half) half.title = 'This map is too large to keep in the browser — save it to a file.';
        return false;
    }
}

/** Is there a map waiting to be restored? */
export function hasSession() {
    try {
        return !!localStorage.getItem(KEY);
    } catch {
        return false;
    }
}

/** Forget the stored map. */
export function clearSession() {
    try {
        localStorage.removeItem(KEY);
    } catch { /* nothing to clear */ }
}

/**
 * Put the stored map back, if there is one.
 *
 * A stored map that will not parse or will not import is dropped rather than retried: it
 * would fail again on the next load, and an editor that cannot start is worse than one
 * that starts empty.
 *
 * @param {any} editor
 * @returns {boolean} whether anything was restored
 */
export function restoreSession(editor) {
    let raw = null;
    try {
        raw = localStorage.getItem(KEY);
    } catch {
        return false;
    }
    if (!raw) return false;

    // Checked here rather than left to importFullState, which catches its own errors and
    // reports them to the user instead of throwing. That is right for a file someone
    // chose to open and wrong for this: a session that cannot be read would be "restored"
    // successfully on every load, leaving an empty map and no way back to a generated one.
    let parsed = null;
    try {
        parsed = JSON.parse(raw);
    } catch {
        parsed = null;
    }
    const hexes = parsed && (Array.isArray(parsed.hexes) ? parsed.hexes : (Array.isArray(parsed) ? parsed : null));
    if (!hexes || !hexes.length) {
        console.warn('[session] the stored map is not readable; starting fresh');
        clearSession();
        return false;
    }

    try {
        importFullState(editor, raw);
        return true;
    } catch (err) {
        console.warn('[session] the stored map could not be restored, starting fresh:', err);
        clearSession();
        return false;
    }
}

/**
 * Save as the map changes, and once more on the way out.
 *
 * @param {any} editor
 */
export function installSessionAutosave(editor) {
    if (!editor) return;

    /** @type {any} */
    let pending = null;
    const schedule = () => {
        clearTimeout(pending);
        pending = setTimeout(() => saveSession(editor), DEBOUNCE_MS);
    };

    // Every edit goes through the undo history, which is exactly the set of changes worth
    // keeping — the overlay toggles and the zoom announce nothing here, and neither is
    // part of the map.
    document.addEventListener(HISTORY_CHANGED, schedule);

    // A reload inside the debounce window would otherwise lose the last edit. pagehide
    // rather than beforeunload: it fires on mobile and on tab discard, where beforeunload
    // does not.
    window.addEventListener('pagehide', () => {
        clearTimeout(pending);
        saveSession(editor);
    });
}
