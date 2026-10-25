// @ts-check
/**
 * Changing map sectors: the four paint tools, assigning a set of hexes, renaming and
 * deleting a sector, and the shift-drag brush stroke.
 *
 * Every change is one undo entry, however many hexes it touches, and goes through
 * saveState so undo, redo and the session autosave carry it like any other hex edit. The
 * sector list itself is not stored anywhere — it is read off the hexes — so there is no
 * global state for undo to miss.
 */

import {
    canJoinSector, circlePositions, clusterPositions, clampGap, listSectors,
    colourSectors, sectorAdjacency, sectorPieces, wouldSplitSector, SECTOR_PALETTE,
} from './mapSectors.js';
import { showToast } from '../ui/uiToast.js';
import { drawMapSectorLayer } from './mapSectorOverlay.js';

/** Fired on `document` after any change to which hex is in which sector. */
export const MAP_SECTORS_CHANGED = 'ti4:map-sectors-changed';

/**
 * The editor modes the sector tools arm. None of them is a key of sectorColors, which is
 * what keeps the click router from treating them as tile types (see isSelectMode).
 */
export const MAP_SECTOR_MODES = Object.freeze({
    brush: 'sector-brush',
    erase: 'sector-erase',
    circle: 'sector-circle',
    cluster: 'sector-cluster',
});

/** @param {string|null|undefined} mode */
export function isMapSectorMode(mode) {
    return Object.values(MAP_SECTOR_MODES).includes(/** @type {any} */ (mode));
}

/** @param {any} editor */
export function announceMapSectorsChanged(editor) {
    drawMapSectorLayer(editor);
    if (typeof document === 'undefined') return;
    document.dispatchEvent(new CustomEvent(MAP_SECTORS_CHANGED));
}

/**
 * Every sector name worth offering: the painted ones, plus sectors created in the panel
 * that have no hexes yet. Those live only on the editor for the session — a sector with
 * no hexes has nothing to save.
 *
 * @param {any} editor
 * @returns {string[]}
 */
export function knownMapSectors(editor) {
    const names = new Set(listSectors(editor.hexes).keys());
    for (const n of editor._pendingMapSectors || []) names.add(n);
    return [...names].sort();
}

/**
 * The colour of every sector, worked out from the map: touching sectors differ, and each
 * keeps the colour it had last time where it can (colourSectors). The last colouring is
 * remembered on the editor for the session only — the colours are derived, never saved.
 *
 * @param {any} editor
 * @returns {Map<string, string>} name → CSS colour
 */
export function mapSectorColours(editor) {
    const index = colourSectors(knownMapSectors(editor), sectorAdjacency(editor.hexes), editor._sectorColourIndex || {});
    editor._sectorColourIndex = index;
    return new Map(Object.entries(index).map(([name, i]) => [name, SECTOR_PALETTE[i]]));
}

/** Offer `name` before anything is painted with it. @param {any} editor @param {string} name */
export function addPendingMapSector(editor, name) {
    if (!editor._pendingMapSectors) editor._pendingMapSectors = new Set();
    editor._pendingMapSectors.add(name);
}

/** @param {any} editor @param {string} name */
export function forgetPendingMapSector(editor, name) {
    editor._pendingMapSectors?.delete(name);
}

/**
 * Drop the sectors that were only names in the panel. A loaded map brings its own
 * sectors, and the empty ones from the map before it mean nothing there.
 * @param {any} editor
 */
export function forgetUnpaintedMapSectors(editor) {
    editor._pendingMapSectors = new Set();
    editor._activeMapSector = null;
}

/**
 * Say why an edit was refused.
 * @param {{name: string, pieces: number}} split @param {string|null} painting
 */
function refuseSplit(split, painting) {
    const why = split.name === painting
        ? `${split.name} would be in ${split.pieces} separate pieces: paint hexes that touch it.`
        : `That would cut ${split.name} into ${split.pieces} pieces.`;
    showToast(`${why} A sector has to be one connected region.`, 'warning', 5000);
}

/** The gap clusters grow with: the bot's sectorGap, 0–2. */
export function sectorGap(editor) {
    return clampGap(editor?.sectorGap);
}

/**
 * Put `labels` in sector `name`, or take them out of any sector when `name` is null.
 * Hexes that cannot be in a sector (the corners) are skipped. One undo entry.
 *
 * @param {any} editor
 * @param {string[]} labels
 * @param {string|null} name
 * @returns {number} how many hexes changed
 */
export function assignMapSector(editor, labels, name) {
    const targets = labels.filter(l => {
        const hex = editor.hexes[l];
        return canJoinSector(hex) && (hex.mapSector || null) !== (name || null);
    });
    if (!targets.length) return 0;

    // A sector is one connected region. Refused whole, with the reason, rather than
    // applied in part.
    const split = wouldSplitSector(editor.hexes, targets, name || null);
    if (split) {
        refuseSplit(split, name);
        return 0;
    }

    editor.beginUndoGroup?.();
    try {
        for (const l of targets) {
            editor.saveState?.(l);
            if (name) editor.hexes[l].mapSector = name;
            else delete editor.hexes[l].mapSector;
        }
        editor.commitUndoGroup?.();
    } catch (err) {
        editor.rollbackUndoGroup?.();
        throw err;
    }
    announceMapSectorsChanged(editor);
    return targets.length;
}

/**
 * Rename a sector on every hex it holds. Renaming onto a sector that already exists merges
 * the two, which is the only thing a rename could sensibly mean there.
 *
 * @param {any} editor @param {string} from @param {string} to
 */
export function renameMapSector(editor, from, to) {
    const members = Object.keys(editor.hexes).filter(l => editor.hexes[l].mapSector === from);
    return assignMapSector(editor, members, to);
}

/** Take every hex out of `name`. @param {any} editor @param {string} name */
export function deleteMapSector(editor, name) {
    const members = Object.keys(editor.hexes).filter(l => editor.hexes[l].mapSector === name);
    return assignMapSector(editor, members, null);
}

/**
 * What a click with a sector tool armed does to the hex under it.
 *
 *   brush    the hex joins the active sector
 *   erase    the hex leaves its sector
 *   circle   every hex within the radius joins (MapFrame.positionsWithin)
 *   cluster  the island of placed tiles the hex is part of joins, grown with the gap and
 *            clipped to the cap, as the bot grows a cluster
 *
 * Fills take hexes from other sectors as paint does. Undo puts them back.
 *
 * @param {any} editor
 * @param {string} label
 * @param {{name: string|null, radius?: number, cap?: number}} tool
 */
export function applyMapSectorTool(editor, label, { name, radius = 1, cap = 0 }) {
    const mode = editor.mode;
    if (mode === MAP_SECTOR_MODES.erase) return assignMapSector(editor, [label], null);
    if (!name) return 0;
    if (mode === MAP_SECTOR_MODES.brush) return assignMapSector(editor, [label], name);
    if (mode === MAP_SECTOR_MODES.circle) {
        return assignMapSector(editor, circlePositions(editor.hexes, label, radius), name);
    }
    if (mode === MAP_SECTOR_MODES.cluster) {
        const gap = sectorGap(editor);
        const cluster = clusterPositions(editor.hexes, label, gap, cap);
        // With a gap the cluster jumps empty hexes, which leaves it in pieces. Said as that,
        // rather than as the general "would be in 2 pieces", which does not explain why.
        if (gap > 0 && sectorPieces(editor.hexes, cluster).length > 1) {
            showToast(`With gap ${gap} this cluster reaches across empty hexes, so it would be in separate pieces. `
                + 'A sector has to be one connected region: set Gap to 0, or paint the hexes in between.', 'warning', 6000);
            return 0;
        }
        return assignMapSector(editor, cluster, name);
    }
    return 0;
}

/**
 * A shift-drag with the brush or the eraser: every hex the pointer crosses, as one undo
 * entry. Same contract as hexSelection.beginSelectionStroke — nothing happens until the
 * pointer reaches a second hex, so a shift-click that wobbles stays a click.
 *
 * @param {any} editor
 * @param {string|null} startLabel
 * @param {() => string|null} activeName  read on each hex, in case the panel changes it
 */
export function beginMapSectorStroke(editor, startLabel, activeName) {
    let last = startLabel;
    let painted = false;
    const erase = editor.mode === MAP_SECTOR_MODES.erase;

    let refused = false;
    const paint = (label) => {
        const hex = editor.hexes[label];
        if (!canJoinSector(hex)) return;
        const name = erase ? null : activeName();
        if (!erase && !name) return;
        if ((hex.mapSector || null) === name) return;
        // Hex by hex, so a stroke that wanders off the sector stops there; said once.
        const split = wouldSplitSector(editor.hexes, [label], name);
        if (split) {
            if (!refused) refuseSplit(split, name);
            refused = true;
            return;
        }
        editor.saveState?.(label);
        if (name) hex.mapSector = name;
        else delete hex.mapSector;
        drawMapSectorLayer(editor);
    };

    return {
        /** @param {string|null} label */
        enter(label) {
            if (!label || label === last) return;
            last = label;
            if (!painted) {
                painted = true;
                editor.beginUndoGroup?.();
                if (startLabel) paint(startLabel);
            }
            paint(label);
        },
        end() {
            if (!painted) return;
            editor.commitUndoGroup?.();
            announceMapSectorsChanged(editor);
        },
        get painted() { return painted; },
    };
}
