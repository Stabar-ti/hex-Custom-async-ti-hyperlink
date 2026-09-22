// @ts-check
/**
 * A preview of what is on the clipboard, under the cursor.
 *
 * The wizard showed a paste preview by adding a CSS class to the destination hexes, which
 * told you where a block would land but nothing about what it was. With a clipboard that
 * outlives the gesture, and a history you can pick from, "where" stopped being enough —
 * two clips land in the same place and put down completely different tiles.
 *
 * So the ghost draws the clip: each tile at its destination, with the real tile art when
 * the system has any and the type colour when it does not, and the whole block outlined.
 * A destination that is already occupied is marked, because a paste overwrites.
 *
 * It is a visual aid rather than a mode. Escape or a right-click dismisses it and nothing
 * is lost — the clipboard still holds the clip, and Ctrl+V or the Paste button brings the
 * ghost back to the cursor.
 */

import { sectorColors } from '../constants/constants.js';
import { activeClip, pastePlan } from './tileClipboard.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LAYER_ID = 'pasteGhostLayer';

/** Whether the ghost is currently following the cursor. */
let armed = false;

/** @param {any} editor */
export function clearGhostLayer(editor) {
    editor?.svg?.querySelector('#' + LAYER_ID)?.remove();
}

/** Is the ghost following the cursor? */
export function isGhostArmed() {
    return armed;
}

/**
 * Stop showing the ghost. The clipboard is untouched.
 * @param {any} editor
 */
export function dismissGhost(editor) {
    armed = false;
    clearGhostLayer(editor);
}

/**
 * Start showing the ghost again, at whichever hex the pointer last reported.
 * @param {any} editor
 */
export function armGhost(editor) {
    if (!activeClip()) return false;
    armed = true;
    if (editor?.hoveredHexLabel) drawGhost(editor, editor.hoveredHexLabel);
    return true;
}

/** Six corner points for a hex, as an SVG points string. */
function corners(center, radius) {
    return Array.from({ length: 6 }, (_, i) => {
        const ang = (Math.PI / 180) * 60 * i;
        return `${center.x + radius * Math.cos(ang)},${center.y + radius * Math.sin(ang)}`;
    }).join(' ');
}

/**
 * Draw the active clip as it would land with its origin on `destLabel`.
 *
 * @param {any} editor
 * @param {string} destLabel
 */
export function drawGhost(editor, destLabel) {
    clearGhostLayer(editor);
    if (!armed || !editor?.svg) return;

    const clip = activeClip();
    const plan = pastePlan(editor, destLabel, clip);
    if (!clip || !plan) return;

    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = LAYER_ID;
    // A preview must never eat the click that commits it.
    layer.style.pointerEvents = 'none';
    layer.setAttribute('opacity', '0.72');

    const radius = editor.hexRadius || 40;
    const occupied = new Set(plan.overwrites);

    for (const tile of clip.tiles) {
        if (!tile) continue;
        const q = tile.q + plan.dq;
        const r = tile.r + plan.dr;
        const destLbl = Object.keys(editor.hexes).find(k => {
            const h = editor.hexes[k];
            return h.q === q && h.r === r;
        });
        const dest = destLbl ? editor.hexes[destLbl] : null;
        // Part of the block that would fall off the edge of the map.
        if (!destLbl || !dest?.center) continue;

        const fill = document.createElementNS(SVG_NS, 'polygon');
        fill.setAttribute('points', corners(dest.center, radius * 0.9));
        fill.setAttribute('fill', sectorColors[tile.baseType] ?? sectorColors['']);
        fill.setAttribute('fill-opacity', '0.55');
        fill.setAttribute('stroke', occupied.has(destLbl) ? '#e35d4f' : '#4fc3f7');
        fill.setAttribute('stroke-width', occupied.has(destLbl) ? '2.5' : '1.5');
        layer.appendChild(fill);

        // The tile art, when SystemInfo has a path for it. It is a preview, so a missing
        // file just leaves the coloured hex rather than a broken image.
        const sys = tile.realId && editor.sectorIDLookup?.[String(tile.realId).toUpperCase()];
        if (sys?.imagePath) {
            const size = radius * 1.75;
            const img = document.createElementNS(SVG_NS, 'image');
            img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `public/data/tiles/${sys.imagePath}`);
            img.setAttribute('x', String(dest.center.x - size / 2));
            img.setAttribute('y', String(dest.center.y - size / 2));
            img.setAttribute('width', String(size));
            img.setAttribute('height', String(size));
            img.setAttribute('opacity', '0.85');
            layer.appendChild(img);
        }
    }

    editor.svg.appendChild(layer);
}

/**
 * Follow the pointer while the ghost is armed.
 *
 * @param {any} editor
 */
export function installPasteGhost(editor) {
    const svg = editor?.svg;
    if (!svg) return;

    svg.addEventListener('mousemove', (ev) => {
        if (!armed) return;
        const target = /** @type {Element|null} */ (ev.target);
        const label = target?.closest?.('[data-label]')?.getAttribute('data-label');
        if (label) drawGhost(editor, label);
    });

    // Off the map there is nothing to preview against, and a ghost frozen on the last hex
    // you happened to leave by reads as a placement that is about to happen.
    svg.addEventListener('mouseleave', () => clearGhostLayer(editor));
}
