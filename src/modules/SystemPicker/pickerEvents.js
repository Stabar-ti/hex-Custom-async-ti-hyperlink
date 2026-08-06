/**
 * How the rest of the app tells the picker that something happened.
 *
 * The picker used to find out by polling: a 250 ms `setInterval` watched
 * `editor.pendingSystemId` for a truthy→null transition and inferred that a tile had been
 * placed (systemLookup.js:788). That misses everything it isn't watching — undo, redo, a
 * map import, the Milty builder filling a slice — so the "used" marks drifted out of date
 * and only came back in sync the next time something happened to call refreshSystemList.
 *
 * Two events on `document` instead. The useful part is where they're emitted: from inside
 * markRealIDUsed / unmarkRealIDUsed / clearRealIDUsage, which every one of those paths
 * already calls. So undo, import and the auto-builders became correct without being
 * touched.
 *
 * Guarded for node, so the picker modules stay importable in tools/test-system-picker.js.
 */

export const PICKER_EVENTS = {
    /** The set of placed tile ids changed. detail: { id?, used? } — absent id means "many". */
    usedIdsChanged: 'ti4:used-ids-changed',
    /** A system was assigned to a hex. detail: { systemId, hexId } */
    systemPlaced: 'ti4:system-placed'
};

function emit(name, detail) {
    if (typeof document === 'undefined') return;
    document.dispatchEvent(new CustomEvent(name, { detail }));
}

/** @param {{id?: string, used?: boolean}} [detail] */
export function emitUsedIdsChanged(detail = {}) {
    emit(PICKER_EVENTS.usedIdsChanged, detail);
}

/** @param {{systemId: string, hexId: string}} detail */
export function emitSystemPlaced(detail) {
    emit(PICKER_EVENTS.systemPlaced, detail);
}

function listen(name, fn) {
    if (typeof document === 'undefined') return () => {};
    document.addEventListener(name, fn);
    return () => document.removeEventListener(name, fn);
}

/** @returns {() => void} unsubscribe */
export function onUsedIdsChanged(fn) {
    return listen(PICKER_EVENTS.usedIdsChanged, fn);
}

/** @returns {() => void} unsubscribe */
export function onSystemPlaced(fn) {
    return listen(PICKER_EVENTS.systemPlaced, fn);
}
