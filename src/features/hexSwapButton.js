// @ts-check
/**
 * Swap, offered where the swap would happen.
 *
 * Swapping two tiles used to be a mode: open the wizard, press Swap, click one tile, click
 * the other, and read a status line in a floating window to find out which step you were
 * on. Four of those five steps exist only to tell the editor which two tiles you meant —
 * and selecting hexes already says that.
 *
 * So the button appears between them, and only when the operation is possible at all:
 * exactly two hexes selected. It is not a mode, nothing is armed, and there is no state to
 * cancel. The selection survives the swap, so pressing it again swaps back.
 */

import { swapHexes } from './tileSwap.js';
import { HEX_SELECTED, selectedHexes } from './hexSelection.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LAYER_ID = 'hexSwapButtonLayer';

/** @param {any} editor */
function clear(editor) {
    editor?.svg?.querySelector('#' + LAYER_ID)?.remove();
}

/**
 * Draw the button between the two selected hexes, or nothing at all.
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

    const cx = (a.center.x + b.center.x) / 2;
    const cy = (a.center.y + b.center.y) / 2;
    const r = Math.max(13, (editor.hexRadius || 40) * 0.34);

    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = LAYER_ID;
    layer.style.cursor = 'pointer';
    // The one overlay that is meant to be clicked, so it opts in rather than inheriting the
    // pointer-events: none every other layer sets.
    layer.style.pointerEvents = 'auto';

    const disc = document.createElementNS(SVG_NS, 'circle');
    disc.setAttribute('cx', String(cx));
    disc.setAttribute('cy', String(cy));
    disc.setAttribute('r', String(r));
    disc.setAttribute('fill', '#1e1e1e');
    disc.setAttribute('stroke', '#4fc3f7');
    disc.setAttribute('stroke-width', '2');
    layer.appendChild(disc);

    const glyph = document.createElementNS(SVG_NS, 'text');
    glyph.setAttribute('x', String(cx));
    glyph.setAttribute('y', String(cy + r * 0.36));
    glyph.setAttribute('text-anchor', 'middle');
    glyph.setAttribute('font-size', String(r * 1.25));
    glyph.setAttribute('font-weight', 'bold');
    glyph.setAttribute('fill', '#4fc3f7');
    // Not selectable: a double-click on the button would otherwise highlight the glyph.
    glyph.style.userSelect = 'none';
    glyph.textContent = '⇄';
    layer.appendChild(glyph);

    const tip = document.createElementNS(SVG_NS, 'title');
    tip.textContent = `Swap ${labels[0]} and ${labels[1]}`;
    layer.appendChild(tip);

    layer.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        swapHexes(editor, labels[0], labels[1]);
        // The hexes have not moved, but swapHexes rebuilds overlay layers and reorders the
        // SVG, which can leave this one behind or beneath them.
        refreshSwapButton(editor);
    });

    // Without this the mousedown reaches the map and starts a pan drag under the pointer,
    // so the click that follows is swallowed as a drag.
    layer.addEventListener('mousedown', (ev) => ev.stopPropagation());

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
