/**
 * The in-progress drawing gesture: which hexes have been clicked so far, and whether the
 * next completed segment adds a link or removes one.
 *
 * This state used to be three raw fields on the editor — `selectedPath`, `linking` and
 * `unlinking` (HexEditor.js:72, 128-130) — written from four files that did not otherwise
 * know about each other: uiEvents.js:28 set `unlinking` directly, svgBindings.js:95-97
 * reset all three on right-click, HexEditor.setMode and generateMap each cleared the path
 * their own way. Nothing owned the gesture, so "what happens on the next click" was spread
 * across the app.
 *
 * Deliberately NOT stored on `editor`, for the same reason pickerState.js keeps the
 * picker's filters off it: this is what one person is half-way through doing right now,
 * not part of the map, and it must never reach a save file. Nothing here is persisted
 * either — restoring a half-drawn path across a reload would be a bug, not a feature.
 *
 * The editor keeps working through accessor properties installed by hyperlaneUI.js, so
 * the existing call sites read and write these names exactly as before while there is one
 * source of truth underneath.
 */

const DEFAULTS = {
    path: [],          // Labels clicked so far, oldest first
    unlinking: false,  // Next completed segment removes rather than adds
    enabled: true      // Whether clicks extend the path at all (was `linking`)
};

let state = { ...DEFAULTS, path: [] };
let listeners = [];

/**
 * @param {(s: {path: string[], unlinking: boolean, enabled: boolean}) => void} fn
 * @returns {() => void} unsubscribe
 */
export function subscribe(fn) {
    listeners.push(fn);
    return () => { listeners = listeners.filter(l => l !== fn); };
}

function notify() {
    // Iterate a copy: a listener that unsubscribes itself must not shift the list mid-loop.
    for (const fn of listeners.slice()) fn(state);
}

// ── Path ──────────────────────────────────────────────────────────────────────

/**
 * The clicked labels, oldest first.
 *
 * Returns a COPY. A live array leaking out of the store is exactly the divergence this
 * module exists to remove — callers that used to do `editor.selectedPath.length = 0` were
 * mutating shared state from outside. Those two sites (HexEditor.js and svgBindings.js)
 * now assign `= []` instead, which routes through setPath.
 */
export function getPath() {
    return state.path.slice();
}

/** The most recently clicked label, or null when the path is empty. */
export function getLastLabel() {
    return state.path.length ? state.path[state.path.length - 1] : null;
}

export function getPathLength() {
    return state.path.length;
}

export function pushLabel(label) {
    state = { ...state, path: [...state.path, label] };
    notify();
}

/**
 * Keep only the last `n` labels.
 * Drawing a segment leaves its last two hexes in place so the next click continues the
 * chain rather than starting over (the `slice(-2)` at hyperlanes.js:98).
 */
export function keepTail(n) {
    if (state.path.length <= n) return;
    state = { ...state, path: state.path.slice(-n) };
    notify();
}

export function setPath(list) {
    state = { ...state, path: Array.isArray(list) ? list.slice() : [] };
    notify();
}

export function clearPath() {
    if (!state.path.length) return;
    state = { ...state, path: [] };
    notify();
}

// ── Modifiers ─────────────────────────────────────────────────────────────────

export function isUnlinking() {
    return state.unlinking;
}

export function setUnlinking(on) {
    const next = !!on;
    if (state.unlinking === next) return;
    state = { ...state, unlinking: next };
    notify();
}

export function isEnabled() {
    return state.enabled;
}

export function setEnabled(on) {
    const next = !!on;
    if (state.enabled === next) return;
    state = { ...state, enabled: next };
    notify();
}

/** Abandon the gesture entirely: forget the path and drop unlink mode. */
export function reset() {
    state = { ...state, path: [], unlinking: false };
    notify();
}

/** Drops listeners as well as state, so one test cannot leak into the next. */
export function __resetForTest() {
    state = { ...DEFAULTS, path: [] };
    listeners = [];
}
