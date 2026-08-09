/**
 * Keeping a hex's hyperlane SVG in step with its matrix.
 *
 * The old code maintained two independent records of the same thing: `hex.matrix`, and
 * `editor.drawnSegments` — one flat array of every link node on the map, searched by
 * scanning for matching data attributes (hyperlanes.js:134, 154). Each edit had to update
 * both, and any path that updated one without the other left the map showing something the
 * data did not say. That is how unlinking a self-loop cleared the matrix cell, removed the
 * arm, and left the circle on screen forever: the circle carried no entry/exit attributes,
 * so the search could not match it.
 *
 * Here there is one direction of travel. The matrix is the truth; `renderHex` throws away
 * everything drawn for a hex and re-derives it from `segments(hex.matrix)`. Divergence
 * stops being a bug that has to be avoided and becomes a state that cannot be represented.
 *
 * The layer itself is the index. Nodes carry `data-via`, so the SVG can be queried for a
 * hex's links directly and no parallel array is needed — which also means generateMap
 * wiping the SVG leaves nothing stale behind, because the "index" went with it.
 */

import { segments } from './hyperlaneModel.js';
import { drawSegment, drawLoop } from '../../draw/hyperlaneDraw.js';
import { enforceSvgLayerOrder } from '../../draw/enforceSvgLayerOrder.js';
import { sectorColors } from '../../constants/constants.js';

export const HYPERLANE_LAYER_ID = 'hyperlane-layer';

/**
 * Finds the hyperlane layer, creating it if it is missing or has been detached.
 *
 * generateMap empties the SVG, so a cached node survives as a detached orphan that accepts
 * appends nobody will ever see. The isConnected check is the same guard TokenOverlay and
 * LoreOverlay use; there is deliberately no module-scope cache here, because querySelector
 * is cheap and a cache is precisely what that guard exists to work around.
 */
export function ensureHyperlaneLayer(svg) {
    if (!svg) return null;
    let layer = svg.querySelector(`#${HYPERLANE_LAYER_ID}`);
    if (layer && !layer.isConnected) layer = null;
    if (!layer) {
        layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        layer.id = HYPERLANE_LAYER_ID;
        // The layer sits above the hex polygons in paint order, so without this the link
        // lines would intercept the very clicks used to draw them.
        layer.style.pointerEvents = 'none';
        svg.appendChild(layer);
        enforceSvgLayerOrder(svg);
    }
    return layer;
}

/**
 * Sets baseType to 'hyperlane' (darker gray) when the hex has active connections, or back
 * to '' (default gray) when cleared. Does not touch undo history.
 */
export function updateHyperlaneBaseType(hex) {
    if (!hex?.polygon) return;
    const hasHL = hex.matrix?.some(row => row.some(cell => cell !== 0));
    if (hasHL && hex.baseType === '') {
        hex.baseType = 'hyperlane';
        hex.polygon.setAttribute('fill', sectorColors['hyperlane']);
    } else if (!hasHL && hex.baseType === 'hyperlane') {
        hex.baseType = '';
        hex.polygon.setAttribute('fill', sectorColors['']);
    }
}

/**
 * Removes every hyperlane node belonging to one hex. Does not touch the matrix.
 *
 * Also sweeps the SVG root, because links drawn before this module existed were appended
 * there rather than into a layer; a map loaded from an older session would otherwise keep
 * its stale nodes forever.
 */
export function clearHexSegments(svg, label) {
    if (!svg) return;
    const selector = `[data-via="${CSS.escape(String(label))}"]`;
    for (const node of svg.querySelectorAll(selector)) node.remove();
}

/**
 * Redraws one hex's links from its matrix.
 *
 * Idempotent by construction: it clears first, so calling it twice leaves the same SVG as
 * calling it once. Every mutation path — draw, unlink, undo, import, paste — ends here.
 */
export function renderHex(editor, label) {
    const hex = editor?.hexes?.[label];
    if (!hex) return;

    clearHexSegments(editor.svg, label);
    updateHyperlaneBaseType(hex);
    if (!hex.matrix || !hex.center) return;

    const layer = ensureHyperlaneLayer(editor.svg);
    if (!layer) return;

    const radius = editor.hexRadius;
    for (const seg of segments(hex.matrix)) {
        if (seg.kind === 'loop') {
            drawLoop(layer, { center: hex.center, entry: seg.entry, radius, viaLabel: label });
        } else {
            drawSegment(layer, {
                center: hex.center, entry: seg.entry, exit: seg.exit, radius, viaLabel: label
            });
        }
    }
}

/** Redraws every hex. For generateMap, bulk import and undo of multi-hex changes. */
export function renderAll(editor) {
    if (!editor?.hexes) return;
    for (const label of Object.keys(editor.hexes)) renderHex(editor, label);
}

/**
 * Clears a hex's links entirely: matrix zeroed, SVG removed. Records no history — callers
 * decide whether the change is undoable.
 *
 * The matrix is zeroed IN PLACE rather than replaced. import.js:233 aliases
 * `hex.links = hex.matrix`, and tileCopyPasteWizard.js:504-508 documents an ordering
 * dependency on this clearing the same object the caller is holding. Rebinding here would
 * leave those aliases pointing at the old matrix.
 */
export function clearHex(editor, label) {
    clearHexSegments(editor?.svg, label);
    const hex = editor?.hexes?.[label];
    if (!hex) return;
    if (Array.isArray(hex.matrix)) for (const row of hex.matrix) row.fill(0);
    updateHyperlaneBaseType(hex);
    hex.polygon?.classList.remove('selected');
}
