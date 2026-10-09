/**
 * What a click on the map means while the hyperlane tool is active.
 *
 * Drawing a link takes three clicks: a hex to come from, the hex the link passes through,
 * and a hex to leave toward. Clicking the first hex again as the third puts a roundabout on
 * the middle one. Clicking the hex the path has reached finishes the lane there. Alt turns
 * the same gesture into an erase; Shift clears a hex outright.
 *
 * Finishing used to have no gesture of its own. Right-click ended the lane, but right-click
 * also disarms the tool, so every lane cost a trip back to the rail to re-arm it. Clicking
 * the head of the path meant nothing — a hex is not its own neighbour — so it is free to
 * mean "done".
 *
 * Two things are different from the old implementation beyond where the code lives.
 *
 * The A→B→C rule is no longer restated here. It moved to hyperlaneModel.resolveSegment,
 * and what a lane does to a tile — including joining a roundabout rather than being drawn
 * through it — moved to withLaneDrawn / withLaneErased. Both are pure and covered by tests,
 * so this file decides only WHEN to apply them. The old version worked out entry/exit
 * inline, then separately re-derived them in _drawLoop and again in _unlink
 * (hyperlanes.js:87-88, 126, 142-143): three copies of the same derivation, each able to
 * disagree with the others.
 *
 * And history is recorded only when something actually changes. The old code called
 * saveState(B) on every third click (hyperlanes.js:96), before it knew whether the click
 * would draw anything — so clicking around in hyperlane mode filled the 20-entry undo
 * stack with snapshots of nothing, pushing real work off the end of it. Each mutation here
 * is one undo group, taken immediately before the write.
 */

import * as state from './hyperlaneState.js';
import {
    dirIndexBetween, resolveSegment, roundaboutSides, sameMatrix, sidesReachedFrom,
    withLaneDrawn, withLaneErased, withRoundabout
} from './hyperlaneModel.js';
import { buildCoordIndex, neighborHex } from '../../utils/hexGrid.js';
import { renderHex, clearHex } from './hyperlaneRender.js';

/**
 * Copies `next` into the hex's own matrix, cell by cell.
 *
 * The rules in hyperlaneModel return new matrices, but the hex keeps its old one:
 * import.js:233 aliases `hex.links = hex.matrix`, which is also why clearHex zeroes in
 * place (see hyperlaneRender.clearHex). Rebinding `hex.matrix` would strand the alias.
 *
 * Those rules write every link in both directions. Drawing used to write only
 * `matrix[entry][exit]`, and the old distance calculation symmetrised the matrix IN PLACE
 * — so whether a map exported working hyperlanes depended on whether a Shift+D had
 * happened to run first.
 */
function writeMatrix(matrix, next) {
    for (let i = 0; i < next.length; i++) {
        for (let j = 0; j < next[i].length; j++) matrix[i][j] = next[i][j];
    }
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
 * Gives one hex a new matrix as one undo step — or does nothing, snapshot included, when
 * it is the matrix the hex already has.
 */
function applyMatrix(editor, label, next) {
    const hex = editor.hexes[label];
    if (!hex?.matrix || sameMatrix(hex.matrix, next)) return;
    withHistory(editor, label, () => {
        writeMatrix(hex.matrix, next);
        renderHex(editor, label);
    });
}

/**
 * Extends the path by one hex and draws a segment if that completed one.
 * Clicking the hex the path has reached finishes the lane; hexes that are not adjacent to
 * it are ignored.
 */
export function selectHex(editor, label) {
    // This used to bail out whenever the lookup popup existed in the DOM, which meant you
    // could not draw hyperlanes with the tile list merely open. The system picker swallows
    // map clicks in the capture phase while a tile is actually armed (pickerPlacement.js),
    // so having the picker on screen no longer implies you are placing.
    if (!state.isEnabled()) return;
    if (!editor.hexes[label]) return;

    const last = state.getLastLabel();
    if (label === last) {
        finishLane(editor);
        return;
    }
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
 * a roundabout made by doubling back and an erase both end the gesture, because neither
 * has an obvious continuation.
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
        applyMatrix(editor, B, withLaneErased(via.matrix, seg.entry, seg.exit));
        cancelGesture(editor);
        return;
    }

    applyMatrix(editor, B, withLaneDrawn(via.matrix, seg.entry, seg.exit));

    if (seg.kind === 'loop') {
        deselect(editor, path.slice(-3));
        state.clearPath();
        return;
    }
    // Keep the last two hexes so the next click continues the chain. All three lose the
    // highlight — the indicator marks the two that stay. Only the last two used to, so the
    // hex the lane started from stayed yellow after it had left the path, and nothing but
    // right-click's sweep of every hex ever took it off.
    deselect(editor, path);
    state.keepTail(2);
}

/**
 * Ends the lane at the hex the path has reached. Nothing is written — the links are
 * already down — so this is the gesture ending without the tool being disarmed.
 */
export function finishLane(editor) {
    cancelGesture(editor);
}

/**
 * The side of the path's head that the lane comes in through, or -1 while the path is
 * too short to have come from anywhere.
 */
function headEntrySide(editor, path) {
    if (path.length < 2) return -1;
    const head = editor.hexes[path[path.length - 1]];
    const prev = editor.hexes[path[path.length - 2]];
    return head && prev ? dirIndexBetween(head, prev) : -1;
}

/** Whether the lane coming into the path's head is already on a roundabout there. */
export function headIsOnRoundabout(editor) {
    const path = state.getPath();
    const side = headEntrySide(editor, path);
    const head = editor.hexes[path[path.length - 1]];
    return side >= 0 && roundaboutSides(head?.matrix).includes(side);
}

/**
 * Puts a roundabout on the hex the path has reached, with the incoming lane joined to it.
 *
 * The path is kept. The next click then leaves the roundabout toward that hex, because
 * withLaneDrawn joins any lane drawn on a roundabout tile to the roundabout — so a second
 * and a third lane can be run out of it without starting over. Doubling back
 * (A → B → A) makes a roundabout on B too, but ends the gesture.
 */
export function roundaboutAtHead(editor) {
    const path = state.getPath();
    const side = headEntrySide(editor, path);
    if (side < 0) return;
    const label = path[path.length - 1];
    const hex = editor.hexes[label];
    if (!hex?.matrix) return;
    applyMatrix(editor, label, withRoundabout(hex.matrix, [side]));
}

/**
 * What a roundabout put on this tile from outside a gesture (the tile context menu) would
 * be: one that takes in every lane already on the tile and every lane on a neighbouring
 * tile that runs into it. Only this tile's matrix is written, so those neighbouring lanes
 * stay exactly as they are and simply arrive at the roundabout — the same as the ○ button
 * does for the one lane being drawn.
 *
 * @returns {{ next: number[][] | null, sides: number[], changed: boolean }}
 *   `sides` are the roundabout's members; empty when no lane touches the tile at all
 */
export function roundaboutPlan(editor, label) {
    const hex = editor.hexes[label];
    if (!hex?.matrix) return { next: null, sides: [], changed: false };
    const index = buildCoordIndex(editor.hexes);
    const neighbours = [0, 1, 2, 3, 4, 5].map(s => neighborHex(editor.hexes, index, hex, s)?.matrix ?? null);
    const next = withRoundabout(hex.matrix, sidesReachedFrom(neighbours));
    const sides = roundaboutSides(next);
    return { next, sides, changed: sides.length > 0 && !sameMatrix(hex.matrix, next) };
}

/** Puts that roundabout down as one undo step. Returns whether anything changed. */
export function placeRoundabout(editor, label) {
    const plan = roundaboutPlan(editor, label);
    if (!plan.changed || !plan.next) return false;
    applyMatrix(editor, label, plan.next);
    return true;
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
