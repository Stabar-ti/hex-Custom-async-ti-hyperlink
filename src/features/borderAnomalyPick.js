// @ts-check
/**
 * One-shot "which edge?" step for a border anomaly chosen from the tile context menu.
 *
 * The menu was opened on a tile and an anomaly type picked; what is still missing is the
 * edge. So the tile is marked, its neighbours are outlined as the places a click can go,
 * the edge under the pointer previews in the anomaly's colour, and a label at the cursor
 * says what to do. A click on a neighbour places the anomaly and ends the step; a click
 * anywhere else says why nothing happened and waits.
 *
 * It is a registered mode, so everything that puts tools down puts this down too:
 * right-click, Escape, and arming any other tool.
 */

import { registerMode, activateMode, deactivateMode } from '../core/registry.js';
import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';
import { getBorderAnomalyTypes, normalizeAnomalyId } from '../constants/borderAnomalies.js';
import { buildCoordIndex, neighborHex, sideBetween } from '../utils/hexGrid.js';
import { hexPoints, sideCorners } from '../utils/hexGeometry.js';
import { showCursorHint, flashCursorHint, hideCursorHint } from '../ui/cursorHint.js';
import { placeBorderAnomaly } from './borderAnomalyPlacement.js';

export const MODE_BORDER_ANOMALY_PICK = 'borderAnomalyPick';
export const TILE_PICK_LAYER_ID = 'tile-pick-layer';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @typedef {object} PickState
 * @property {any} editor
 * @property {string} from
 * @property {string} typeId
 * @property {string} name
 * @property {string} color
 * @property {SVGGElement} layer
 * @property {SVGLineElement} edge
 * @property {Set<string>} neighbours
 * @property {(e: MouseEvent) => void} onClick
 * @property {(e: MouseEvent) => void} onMove
 * @property {string} cursorBefore
 */

/** @type {PickState | null} */
let pick = null;

registerMode(MODE_BORDER_ANOMALY_PICK, { deactivate: () => finish() });

export function isBorderAnomalyPickActive() {
    return pick !== null;
}

/**
 * @param {any} editor
 * @param {string} from     the tile the menu was opened on
 * @param {string} typeId
 * @param {{ x?: number, y?: number }} [at]  the pointer, so the hint appears under it
 */
export function startBorderAnomalyPick(editor, from, typeId, at = {}) {
    const hex = editor.hexes[from];
    if (!hex?.center) return;
    // Puts down any other mode first, so one thing at a time answers a map click.
    // activateMode spares the mode being armed, so a pick already running ends here.
    finish();
    activateMode(MODE_BORDER_ANOMALY_PICK);

    const type = getBorderAnomalyTypes()[normalizeAnomalyId(typeId)];
    const name = type?.name || typeId;
    const color = type?.drawStyle?.color || '#ff7300';
    const svg = editor.svg;

    const index = buildCoordIndex(editor.hexes);
    const neighbours = new Set();
    for (let side = 0; side < 6; side++) {
        const n = neighborHex(editor.hexes, index, hex, side);
        if (n?.center) neighbours.add(n.label);
    }

    const layer = /** @type {SVGGElement} */ (document.createElementNS(SVG_NS, 'g'));
    layer.id = TILE_PICK_LAYER_ID;
    layer.style.pointerEvents = 'none';
    const r = editor.hexRadius * 0.94;
    for (const label of neighbours) {
        layer.appendChild(svgEl('polygon', {
            class: 'tile-pick-candidate',
            points: hexPoints(editor.hexes[label].center, r)
        }));
    }
    const origin = svgEl('polygon', { class: 'tile-pick-origin', points: hexPoints(hex.center, r) });
    origin.style.setProperty('--pick-color', color);
    layer.appendChild(origin);
    const edge = /** @type {SVGLineElement} */ (svgEl('line', { class: 'tile-pick-edge' }));
    edge.style.setProperty('--pick-color', color);
    edge.style.display = 'none';
    layer.appendChild(edge);
    svg.querySelector(`#${TILE_PICK_LAYER_ID}`)?.remove();
    svg.appendChild(layer);
    enforceSvgLayerOrder(svg);

    const onMove = (/** @type {MouseEvent} */ e) => {
        const label = hexLabelAt(e.clientX, e.clientY);
        const side = label && neighbours.has(label) ? sideBetween(hex, editor.hexes[label]) : undefined;
        if (side === undefined) {
            edge.style.display = 'none';
            return;
        }
        const [p1, p2] = sideCorners(hex.center, editor.hexRadius, side);
        edge.setAttribute('x1', String(p1.x));
        edge.setAttribute('y1', String(p1.y));
        edge.setAttribute('x2', String(p2.x));
        edge.setAttribute('y2', String(p2.y));
        edge.style.display = '';
    };

    const onClick = (/** @type {MouseEvent} */ e) => {
        // A press that turned into a pan ends in a click the map has already refused.
        if (e.defaultPrevented) return;
        e.preventDefault();
        e.stopPropagation();
        const label = hexLabelAt(e.clientX, e.clientY);
        if (!label) return;
        if (label === from) {
            flashCursorHint(`Pick a tile next to ${from}, not ${from} itself`);
            return;
        }
        if (!neighbours.has(label)) {
            flashCursorHint(`${label} isn't next to ${from}`);
            return;
        }
        // Placing something you then can't see reads as "it didn't work".
        if (!editor.showBorderAnomalies) editor.showBorderAnomalies = true;
        placeBorderAnomaly(editor, from, label, normalizeAnomalyId(typeId));
        deactivateMode(MODE_BORDER_ANOMALY_PICK);
    };

    svg.addEventListener('click', onClick, true);
    svg.addEventListener('mousemove', onMove);
    const cursorBefore = svg.style.cursor;
    svg.style.cursor = 'crosshair';

    pick = { editor, from, typeId, name, color, layer, edge, neighbours, onClick, onMove, cursorBefore };
    showCursorHint(`${name}: click a tile next to ${from} · right-click cancels`, at);
}

/** Ends the step, placed or not. Runs as the mode's deactivate. */
function finish() {
    if (!pick) return;
    const { editor, layer, onClick, onMove, cursorBefore } = pick;
    pick = null;
    editor.svg.removeEventListener('click', onClick, true);
    editor.svg.removeEventListener('mousemove', onMove);
    editor.svg.style.cursor = cursorBefore;
    layer.remove();
    hideCursorHint();
}

/** The tile under a point, looking through the overlays drawn on top of the tiles. */
function hexLabelAt(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
        if (el instanceof SVGPolygonElement && el.dataset.label) return el.dataset.label;
    }
    return null;
}

/**
 * @param {string} name
 * @param {Record<string, string>} attrs
 */
function svgEl(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
}
