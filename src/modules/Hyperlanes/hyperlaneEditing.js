/**
 * What a click on the map means while the hyperlane tool is active.
 *
 * Drawing a link takes three clicks: a hex to come from, the hex the link passes through,
 * and a hex to leave toward. Clicking the first hex again as the third makes a self-loop.
 * Alt turns the same gesture into an erase; Shift clears a hex outright.
 *
 * Two things are different from the old implementation beyond where the code lives.
 *
 * The A→B→C rule is no longer restated here. It moved to hyperlaneModel.resolveSegment,
 * which is pure and covered by tests, so this file decides only what to DO with a resolved
 * segment — not what one is. The old version worked out entry/exit inline, then separately
 * re-derived them in _drawLoop and again in _unlink (hyperlanes.js:87-88, 126, 142-143):
 * three copies of the same derivation, each able to disagree with the others.
 *
 * And history is recorded only when something actually changes. The old code called
 * saveState(B) on every third click (hyperlanes.js:96), before it knew whether the click
 * would draw anything — so clicking around in hyperlane mode filled the 20-entry undo
 * stack with snapshots of nothing, pushing real work off the end of it. Each mutation here
 * is one undo group, taken immediately before the write.
 */

import * as state from './hyperlaneState.js';
import { hasLink, resolveSegment } from './hyperlaneModel.js';
import { renderHex, clearHex } from './hyperlaneRender.js';

/**
 * Writes a link in BOTH directions, in place.
 *
 * A hyperlane link is a piece of wiring between two edges of a tile, and wiring does not
 * have a direction — if edge 5 connects to edge 2, a ship can travel either way. Nothing
 * in the UI can express "one-way", and every consumer wants it symmetric: drawDistances
 * symmetrises before traversing, and exportMap mirrors before serialising.
 *
 * Drawing used to write only `matrix[entry][exit]`, so the stored data was the one place
 * that disagreed. That went unnoticed because the old distance calculation symmetrised the
 * matrix IN PLACE — so the first Shift+D quietly repaired it. Whether your map exported
 * working hyperlanes therefore depended on whether you had happened to run a distance
 * calculation first. Recording both directions here is what makes that irrelevant.
 */
function setBothWays(matrix, entry, exit, value) {
    matrix[entry][exit] = value;
    matrix[exit][entry] = value;
}

/**
 * A `{[label]: {q, r}}` view of the map, which is all resolveSegment needs.
 * Built per gesture; only ever three labels are looked up.
 */
function coordsFor(editor, labels) {
    const out = {};
    for (const label of labels) {
        const hex = editor.hexes[label];
        if (hex) out[label] = { q: hex.q, r: hex.r };
    }
    return out;
}

/** Drops the `.selected` highlight from the given hexes (the whole path by default). */
export function deselect(editor, labels = state.getPath()) {
    for (const id of labels) editor.hexes[id]?.polygon?.classList.remove('selected');
}

/** Clears the in-progress gesture: highlights, path and unlink mode. */
export function cancelGesture(editor) {
    deselect(editor);
    state.reset();
}

/**
 * Snapshots one hex, then mutates it — one undo step.
 *
 * Deliberately plain `saveState` rather than the beginUndoGroup/commitUndoGroup bracket
 * that pickerPlacement.js:144-152 uses. Groups exist to fold a multi-hex batch into one
 * entry, and every hyperlane edit touches exactly one hex, so a group would buy nothing
 * and cost correctness: deleteAllSegments is called from inside assignSystem, which its
 * callers already run inside their own group with `_historyLocked` set. A nested
 * commitUndoGroup would close the CALLER's group early, and a nested `finally` unlocking
 * history would let the rest of assignSystem record snapshots it is meant to suppress.
 * saveState composes correctly in both positions: it appends to an open group, and
 * no-ops while locked.
 *
 * What did change is when it is called. The old code snapshotted on every third click
 * (hyperlanes.js:96) before knowing whether anything would happen, so idle clicking
 * flushed real work out of the 20-entry stack. Callers here snapshot only once they know
 * they are about to write.
 */
function withHistory(editor, label, mutate) {
    editor.saveState(label);
    mutate();
}

/**
 * Extends the path by one hex and draws a segment if that completed one.
 * Ignores hexes that are not adjacent to the current end of the path.
 */
export function selectHex(editor, label) {
    // This used to bail out whenever the lookup popup existed in the DOM, which meant you
    // could not draw hyperlanes with the tile list merely open. The system picker swallows
    // map clicks in the capture phase while a tile is actually armed (pickerPlacement.js),
    // so having the picker on screen no longer implies you are placing.
    if (!state.isEnabled()) return;
    if (!editor.hexes[label]) return;

    const last = state.getLastLabel();
    if (!last || editor.areNeighbors(last, label)) {
        state.pushLabel(label);
        editor.hexes[label].polygon?.classList.add('selected');
    }
    tryCompleteSegment(editor);
}

/**
 * Once three hexes are on the path, applies the segment they describe.
 *
 * Adding leaves the last two hexes in place so a run of links can be drawn in one sweep;
 * looping and erasing end the gesture, because neither has an obvious continuation.
 */
export function tryCompleteSegment(editor) {
    const path = state.getPath();
    if (path.length < 3) return;

    const [A, B, C] = path.slice(-3);
    const seg = resolveSegment(coordsFor(editor, [A, B, C]), A, B, C);

    // Non-adjacent labels should be impossible — selectHex enforces adjacency — but a
    // corrupt path must abandon the gesture rather than write matrix[-1][-1].
    if (!seg) {
        cancelGesture(editor);
        return;
    }

    const via = editor.hexes[B];
    if (!via?.matrix) return;

    if (state.isUnlinking()) {
        if (hasLink(via.matrix, seg.entry, seg.exit) || hasLink(via.matrix, seg.exit, seg.entry)) {
            withHistory(editor, B, () => {
                setBothWays(via.matrix, seg.entry, seg.exit, 0);
                renderHex(editor, B);
            });
        }
        cancelGesture(editor);
        return;
    }

    if (seg.kind === 'loop') {
        if (!via.matrix[seg.entry][seg.entry]) {
            withHistory(editor, B, () => {
                via.matrix[seg.entry][seg.entry] = 1;
                renderHex(editor, B);
            });
        }
        deselect(editor, path.slice(-3));
        state.clearPath();
        return;
    }

    if (!hasLink(via.matrix, seg.entry, seg.exit)) {
        withHistory(editor, B, () => {
            setBothWays(via.matrix, seg.entry, seg.exit, 1);
            renderHex(editor, B);
        });
    }
    // Keep the last two hexes so the next click continues the chain.
    deselect(editor, path.slice(-2));
    state.keepTail(2);
}

/**
 * Removes every link on a hex as one undoable step.
 *
 * Called both from a top-level Shift+click and from inside assignSystem/import/undo, so it
 * must stay composable — see withHistory.
 */
export function deleteAllSegments(editor, label) {
    withHistory(editor, label, () => clearHex(editor, label));
}

/**
 * Routes a map click. Returns true when the click was consumed.
 *
 * The modifier-to-intent mapping lives here rather than in uiEvents, which previously
 * reached in and set `editor.unlinking = true` itself (uiEvents.js:28) — the only place
 * outside this module that knew unlink mode existed.
 */
export function handleHexClick(editor, label, { shiftKey = false, altKey = false } = {}) {
    if (shiftKey) {
        deleteAllSegments(editor, label);
        return true;
    }
    if (altKey) state.setUnlinking(true);
    selectHex(editor, label);
    return true;
}
