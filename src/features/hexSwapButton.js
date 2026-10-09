// @ts-check
/**
 * Swap, offered where the swap would happen.
 *
 * Swapping two tiles used to be a mode: open the wizard, press Swap, click one tile, click
 * the other, and read a status line in a floating window to find out which step you were
 * on. Four of those five steps exist only to tell the editor which two tiles you meant —
 * and selecting hexes already says that.
 *
 * So the button appears on the tiles, and only when the operation is possible at all:
 * exactly two hexes selected. It is not a mode, nothing is armed, and there is no state to
 * cancel. The selection survives the swap, so pressing it again swaps back.
 *
 * WHERE IT SITS
 *
 * Two hexes that touch share an edge, and that edge is the one place that belongs to both
 * of them: one button, on the border between them.
 *
 * Two hexes that do not touch have no such place. The midpoint between them is the obvious
 * guess and the wrong one — for tiles on opposite sides of the map it lands in the middle
 * of everything, nowhere near either tile, attached to whatever happens to be under it. So
 * each tile gets its own button, on its own border, facing the other one. Both do the same
 * thing; whichever tile you are looking at has one.
 */

import { swapHexes } from './tileSwap.js';
import { HEX_SELECTED, selectedHexes } from './hexSelection.js';
import { EDGE_DIRECTIONS } from '../utils/hexGrid.js';
import { edgeMidpoint } from '../utils/hexGeometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LAYER_ID = 'hexSwapButtonLayer';

/** @param {any} editor */
function clear(editor) {
    editor?.svg?.querySelector('#' + LAYER_ID)?.remove();
}

/**
 * The side of `a` that faces `b`, or -1 when they do not touch.
 * @returns {number}
 */
function sharedSide(a, b) {
    for (let s = 0; s < 6; s++) {
        const d = EDGE_DIRECTIONS[s];
        if (a.q + d.q === b.q && a.r + d.r === b.r) return s;
    }
    return -1;
}

/** A point on `from`'s rim, in the direction of `to`. */
function rimToward(from, to, radius) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: from.x + (dx / len) * radius, y: from.y + (dy / len) * radius };
}

/**
 * @param {any} editor
 * @param {{x: number, y: number}} at
 * @param {string[]} labels
 * @returns {SVGGElement}
 */
function button(editor, at, labels) {
    const r = Math.max(12, (editor.hexRadius || 40) * 0.3);

    const g = document.createElementNS(SVG_NS, 'g');
    g.style.cursor = 'pointer';
    // The one overlay meant to be clicked, so it opts in rather than inheriting the
    // pointer-events: none every other layer sets.
    g.style.pointerEvents = 'auto';

    const disc = document.createElementNS(SVG_NS, 'circle');
    disc.setAttribute('cx', String(at.x));
    disc.setAttribute('cy', String(at.y));
    disc.setAttribute('r', String(r));
    disc.setAttribute('fill', '#1e1e1e');
    disc.setAttribute('stroke', '#4fc3f7');
    disc.setAttribute('stroke-width', '2');
    g.appendChild(disc);

    const glyph = document.createElementNS(SVG_NS, 'text');
    glyph.setAttribute('x', String(at.x));
    glyph.setAttribute('y', String(at.y + r * 0.36));
    glyph.setAttribute('text-anchor', 'middle');
    glyph.setAttribute('font-size', String(r * 1.25));
    glyph.setAttribute('font-weight', 'bold');
    glyph.setAttribute('fill', '#4fc3f7');
    // Not selectable: a double-click would otherwise highlight the glyph.
    glyph.style.userSelect = 'none';
    glyph.textContent = '⇄';
    g.appendChild(glyph);

    const tip = document.createElementNS(SVG_NS, 'title');
    tip.textContent = `Swap ${labels[0]} and ${labels[1]}`;
    g.appendChild(tip);

    g.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        swapHexes(editor, labels[0], labels[1]);
        // The hexes have not moved, but swapHexes rebuilds overlay layers and reorders the
        // SVG, which can leave this one behind or beneath them.
        refreshSwapButton(editor);
    });

    // Without this the mousedown reaches the map and starts a pan drag under the pointer,
    // so the click that follows is swallowed as a drag.
    g.addEventListener('mousedown', (ev) => ev.stopPropagation());

    return g;
}

/**
 * Draw the swap affordance for the current selection, or nothing at all.
 * @param {any} editor
 */
export function refreshSwapButton(editor) {
    clear(editor);
    if (!editor?.svg) return;

    const labels = selectedHexes(editor);
    if (labels.length !== 2) return;

    const a = editor.hexes?.[labels[0]];
    const b = editor.hexes?.[labels[1]];
    if (!a?.center || !b?.center) return;

    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = LAYER_ID;

    const radius = editor.hexRadius || 40;
    const side = sharedSide(a, b);

    if (side >= 0) {
        // They touch: one button, on the edge they share.
        layer.appendChild(button(editor, edgeMidpoint(a.center, radius, side), labels));
    } else {
        // They do not: one on each tile's rim, facing the other.
        layer.appendChild(button(editor, rimToward(a.center, b.center, radius * 0.88), labels));
        layer.appendChild(button(editor, rimToward(b.center, a.center, radius * 0.88), labels));
    }

    editor.svg.appendChild(layer);
}

/**
 * Follow the selection.
 * @param {any} editor
 */
export function installSwapButton(editor) {
    if (!editor) return;
    document.addEventListener(HEX_SELECTED, () => refreshSwapButton(editor));
    refreshSwapButton(editor);
}
