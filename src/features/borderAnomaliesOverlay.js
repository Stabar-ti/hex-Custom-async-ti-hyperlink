// features/borderAnomaliesOverlay.js
import { drawBorderAnomaliesLayer } from '../draw/borderAnomaliesDraw.js';

/**
 * Toggle the border anomalies overlay on/off, update flag and visibility.
 * Do NOT touch UI button state here! Let the UI code (bindUI) handle that.
 */
export function toggleBorderAnomaliesOverlay(editor) {
    // Always toggle the flag and update visibility
    editor.showBorderAnomalies = !editor.showBorderAnomalies;
    let layer = editor.svg.querySelector('#borderAnomalyLayer');
    if (!layer) {
        drawBorderAnomaliesLayer(editor);
        layer = editor.svg.querySelector('#borderAnomalyLayer');
    }
    if (layer) {
        layer.setAttribute('visibility', editor.showBorderAnomalies ? 'visible' : 'hidden');
    }
}

/**
 * Explicitly show the overlay (make it visible and update flag).
 */
export function showBorderAnomaliesOverlay(editor) {
    editor.showBorderAnomalies = true;
    let layer = editor.svg.querySelector('#borderAnomalyLayer');
    if (!layer) {
        drawBorderAnomaliesLayer(editor);
        layer = editor.svg.querySelector('#borderAnomalyLayer');
    }
    if (layer) layer.setAttribute('visibility', 'visible');
    // NO .classList.add('active') here!
}

/**
 * Explicitly hide the overlay (make it hidden and update flag).
 */
export function hideBorderAnomaliesOverlay(editor) {
    editor.showBorderAnomalies = false;
    let layer = editor.svg.querySelector('#borderAnomalyLayer');
    if (layer) layer.setAttribute('visibility', 'hidden');
    // NO .classList.remove('active') here!
}

/**
 * Redraw the overlay and set its visibility according to the flag.
 */
export function redrawBorderAnomaliesOverlay(editor) {
    drawBorderAnomaliesLayer(editor);
    let layer = editor.svg.querySelector('#borderAnomalyLayer');
    if (layer) layer.setAttribute('visibility', editor.showBorderAnomalies ? 'visible' : 'hidden');
    // NO UI stuff here!
}
