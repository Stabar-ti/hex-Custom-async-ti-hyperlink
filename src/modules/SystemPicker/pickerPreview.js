/**
 * The floating tile card that appears when you hover a result.
 *
 * One element, reused. Both views attach to it through `attachPreview(el, sys)`, so the
 * table and the grid can't drift apart the way the old picker's table row and hover card
 * had (they built the same information twice, differently).
 */

import { buildPreview } from './pickerCells.js';

const HOVER_DELAY = 350;   // long enough not to flash while scanning, short enough to feel responsive
const EDGE = 12;

let el = null;
let timer = null;

function ensure() {
    if (el && el.isConnected) return el;
    el = document.createElement('div');
    el.id = 'sp-preview';
    el.className = 'sp-preview-popup';
    el.hidden = true;
    document.body.appendChild(el);
    return el;
}

function position(x, y) {
    const node = ensure();
    const r = node.getBoundingClientRect();
    let left = x + 16;
    let top = y - 10;
    if (left + r.width > window.innerWidth - EDGE) left = x - r.width - 16;
    if (top + r.height > window.innerHeight - EDGE) top = window.innerHeight - r.height - EDGE;
    node.style.left = `${Math.max(EDGE, left)}px`;
    node.style.top = `${Math.max(EDGE, top)}px`;
}

export function hidePreview() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (el) el.hidden = true;
}

/** Tears the element down entirely — for popup close, so nothing is left behind. */
export function destroyPreview() {
    hidePreview();
    if (el?.isConnected) el.remove();
    el = null;
}

/**
 * Wires hover/move/leave on a result element so it shows `sys`.
 * Returns nothing; listeners die with the element.
 */
export function attachPreview(target, sys) {
    target.addEventListener('mouseenter', e => {
        if (timer) clearTimeout(timer);
        const { clientX, clientY } = e;
        timer = setTimeout(() => {
            const node = ensure();
            node.innerHTML = '';
            node.appendChild(buildPreview(sys));
            node.hidden = false;
            position(clientX, clientY);
            timer = null;
        }, HOVER_DELAY);
    });

    target.addEventListener('mousemove', e => {
        if (el && !el.hidden) position(e.clientX, e.clientY);
    });

    target.addEventListener('mouseleave', hidePreview);
}
