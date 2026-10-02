// @ts-check
/**
 * Writing border anomalies onto the map, for every caller: the Border Anomalies panel's
 * click-two-tiles tools and the tile context menu's pick-an-adjacent-tile step.
 *
 * This lived inline in the panel's click handler, twice (one- and two-sided), and the
 * two-sided copy opened an undo group and snapshotted both tiles before it checked that
 * they were neighbours. Clicking two tiles that were not left the group open, and every
 * later saveState folded into it until something else happened to close it. Adjacency is
 * checked first now, before any history is touched.
 *
 * Data shape: `hex.borderAnomalies = { [side 0-5]: { type: ID } }`. A two-sided type is
 * written on both tiles, each on its own side of the shared edge.
 */

import { drawBorderAnomaliesLayer } from '../draw/borderAnomaliesDraw.js';
import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';
import { getBorderAnomalyTypes, normalizeAnomalyId } from '../constants/borderAnomalies.js';
import { buildCoordIndex, neighborHex, sideBetween, oppositeSide } from '../utils/hexGrid.js';

/** Whether a type is drawn on both tiles of an edge. */
export function isBidirectionalAnomaly(typeId) {
    return !!getBorderAnomalyTypes()[normalizeAnomalyId(typeId)]?.bidirectional;
}

/**
 * Put an anomaly on the edge between two adjacent tiles, as one undo step.
 *
 * @param {any} editor
 * @param {string} from  the tile it belongs to (a one-sided anomaly is written here only)
 * @param {string} to    the neighbour across the edge
 * @param {string} typeId
 * @param {{ bidirectional?: boolean }} [opts]  defaults to the type's own setting
 * @returns {boolean} false when the tiles are not neighbours — nothing was written
 */
export function placeBorderAnomaly(editor, from, to, typeId, opts = {}) {
    const a = editor.hexes[from];
    const b = editor.hexes[to];
    const side = a && b && from !== to ? sideBetween(a, b) : undefined;
    if (side === undefined) return false;

    const both = opts.bidirectional ?? isBidirectionalAnomaly(typeId);
    if (both) {
        editor.beginUndoGroup();
        editor.saveState(from);
        editor.saveState(to);
        (a.borderAnomalies ??= {})[side] = { type: typeId };
        (b.borderAnomalies ??= {})[oppositeSide(side)] = { type: typeId };
        editor.commitUndoGroup();
    } else {
        editor.saveState(from);
        (a.borderAnomalies ??= {})[side] = { type: typeId };
    }
    redraw(editor);
    return true;
}

/**
 * Remove every anomaly on a tile, and the far half of each two-sided one, as one undo
 * step. The panel's version only snapshotted the tile itself, so undo brought back this
 * tile's half of a two-sided anomaly and left its neighbour's half gone.
 *
 * @returns {boolean} whether there was anything to remove
 */
export function removeBorderAnomalies(editor, label) {
    const hex = editor.hexes[label];
    if (!hex?.borderAnomalies || !Object.keys(hex.borderAnomalies).length) return false;

    const types = getBorderAnomalyTypes();
    const index = buildCoordIndex(editor.hexes);
    /** @type {Array<[any, number]>} */
    const farHalves = [];
    for (const [side, anomaly] of Object.entries(hex.borderAnomalies)) {
        if (!types[normalizeAnomalyId(anomaly?.type)]?.bidirectional) continue;
        const neighbour = neighborHex(editor.hexes, index, hex, Number(side));
        const far = oppositeSide(Number(side));
        if (neighbour?.borderAnomalies?.[far]) farHalves.push([neighbour, far]);
    }

    editor.beginUndoGroup();
    editor.saveState(label);
    for (const [neighbour] of farHalves) editor.saveState(neighbour.label);
    for (const [neighbour, far] of farHalves) {
        delete neighbour.borderAnomalies[far];
        if (!Object.keys(neighbour.borderAnomalies).length) delete neighbour.borderAnomalies;
    }
    delete hex.borderAnomalies;
    editor.commitUndoGroup();

    redraw(editor);
    return true;
}

function redraw(editor) {
    // The panel's redraw also keeps the overlay's visibility and toggle button in step.
    if (typeof editor.redrawBorderAnomaliesOverlay === 'function') editor.redrawBorderAnomaliesOverlay();
    else drawBorderAnomaliesLayer(editor);
    enforceSvgLayerOrder(editor.svg);
}
