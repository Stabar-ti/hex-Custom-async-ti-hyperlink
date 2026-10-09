// @ts-check
/**
 * Moving the map: zoom, reset, and pan mode.
 *
 * All three were reachable only by gesture — wheel to zoom, middle-drag to pan, and no way
 * at all to get back to the default view. Gestures are fine as the fast path, but they are
 * not discoverable, and middle-drag in particular is unavailable to anyone on a trackpad or
 * a two-button mouse. These are the functions behind the buttons in the top bar.
 *
 * `editor._currentViewBox` is the source of truth that svgBindings drives wheel-zoom and
 * panning from; the SVG's viewBox attribute is written from it. Everything here goes
 * through `applyViewBox` so those two never drift apart again.
 */

import { autoscaleView } from '../draw/drawHexes.js';

/** How much one press of zoom-in or zoom-out changes the scale. */
const ZOOM_STEP = 1.25;

/** Bounds, as a multiple of the fitted view. Stops the map vanishing or filling one hex. */
const MIN_SCALE = 0.2;
const MAX_SCALE = 12;

/**
 * Write a viewBox to both the attribute and the editor's copy.
 *
 * @param {any} editor
 * @param {number[]} box - [x, y, width, height]
 */
export function applyViewBox(editor, box) {
    editor._currentViewBox = box;
    editor.svg?.setAttribute('viewBox', box.join(' '));
}

/**
 * The viewBox the map is fitted to, captured the first time it is asked for. Used to keep
 * zooming inside sensible bounds and to report a percentage the user can act on.
 *
 * @param {any} editor
 * @returns {number[]|null}
 */
function fittedBox(editor) {
    if (!editor._fittedViewBox) {
        const current = editor._currentViewBox;
        if (!current || !current[2]) return null;
        editor._fittedViewBox = current.slice();
    }
    return editor._fittedViewBox;
}

/**
 * Zoom about the centre of the view.
 *
 * Centre, not the pointer: these are button presses, and the pointer is over the button.
 * The wheel handler in svgBindings zooms about the pointer, which is right for a wheel.
 *
 * @param {any} editor
 * @param {number} factor - >1 zooms in, <1 zooms out
 */
export function zoomBy(editor, factor) {
    const current = editor._currentViewBox;
    if (!current) return;
    const fitted = fittedBox(editor);
    const [x, y, w, h] = current;

    let dw = w / factor;
    let dh = h / factor;

    if (fitted) {
        const minW = fitted[2] / MAX_SCALE;
        const maxW = fitted[2] / MIN_SCALE;
        if (dw < minW) { dh *= minW / dw; dw = minW; }
        if (dw > maxW) { dh *= maxW / dw; dw = maxW; }
    }

    applyViewBox(editor, [x + (w - dw) / 2, y + (h - dh) / 2, dw, dh]);
}

/** Frame the whole map again, whatever the user has zoomed or panned to. */
export function resetView(editor) {
    autoscaleView(editor);          // rewrites both the attribute and _currentViewBox
    editor._fittedViewBox = editor._currentViewBox?.slice();
}

/**
 * Current zoom as a percentage of the fitted view, where 100% is "the whole map".
 *
 * @param {any} editor
 * @returns {number}
 */
export function zoomLevel(editor) {
    const current = editor._currentViewBox;
    const fitted = fittedBox(editor);
    if (!current?.[2] || !fitted?.[2]) return 100;
    return Math.round((fitted[2] / current[2]) * 100);
}

// ── Pan mode ─────────────────────────────────────────────────────────────────

/**
 * Pan mode makes left-drag pan the map instead of painting it.
 *
 * Middle-drag already panned, but a trackpad has no middle button and neither does every
 * mouse, so panning was effectively unavailable to some people. svgBindings reads this
 * flag; it stays on until turned off, because the whole point is to drag repeatedly.
 *
 * @param {any} editor
 * @param {boolean} on
 */
// setPanMode, isPanMode, togglePanMode and PAN_MODE_CHANGED lived here.
//
// Panning was a mode you switched on, because left-drag used to be free for a tool that
// wanted it and none ever claimed it. A drag that moves the map and a click that reaches
// the hex under it are not in conflict — svgBindings already suppresses the click that
// follows a drag — so the mode was a switch between "panning works" and "panning does
// not", which is not a choice worth offering.
//
// It also had a sharp edge: the hand button carried .mode-button like every other button
// built by the kit, so disarmAll's "turn off everything that is lit" query matched it and
// a right-click switched panning off.

export { ZOOM_STEP };
