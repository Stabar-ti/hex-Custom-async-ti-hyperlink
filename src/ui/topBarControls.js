// @ts-check
/**
 * The verbs that had no buttons.
 *
 * Undo and redo were Ctrl+Z and Ctrl+Shift+Z only. Zoom was the wheel only. Panning was
 * middle-drag only — unavailable on a trackpad. Resetting the view was not possible at all
 * once you had zoomed away. Fourteen capabilities in this app are reachable only by gesture;
 * these are the five people reach for hourly, so they get buttons at the front of the bar.
 *
 * They sit in two groups at the left of the top bar, before the existing menus: Edit (undo,
 * redo) and View (pan mode, zoom out, zoom level, zoom in, reset). Both are built with the
 * kit, so they carry classes rather than inline styles.
 */

import { button, el } from './kit/index.js';
import {
    zoomBy, resetView, zoomLevel, ZOOM_STEP,
} from './viewControls.js';
import { HISTORY_CHANGED } from '../features/history.js';

/**
 * @param {object} opts
 * @param {string} opts.id
 * @param {string} opts.icon
 * @param {string} opts.title
 * @param {() => void} opts.onClick
 * @returns {HTMLButtonElement}
 */
function iconButton({ id, icon, title, onClick }) {
    return button({ id, text: icon, title, className: 'tb-icon-btn', onClick });
}

/**
 * Build the Edit and View groups and put them at the start of #leftControls.
 *
 * @param {any} editor
 */
export function installTopBarControls(editor) {
    const host = document.getElementById('leftControls');
    if (!host) return;
    if (document.getElementById('tbUndo')) return;   // already installed

    // ── Edit ──────────────────────────────────────────────────────────────────
    const undoBtn = iconButton({
        id: 'tbUndo', icon: '↶', title: 'Undo (Ctrl+Z)',
        onClick: () => editor.undo?.(),
    });
    const redoBtn = iconButton({
        id: 'tbRedo', icon: '↷', title: 'Redo (Ctrl+Shift+Z)',
        onClick: () => editor.redo?.(),
    });

    // Disabled until there is something to undo, so the buttons say what is possible
    // rather than doing nothing when pressed.
    const syncHistory = () => {
        undoBtn.disabled = !(editor.undoStack?.length);
        redoBtn.disabled = !(editor.redoStack?.length);
    };
    syncHistory();
    document.addEventListener(HISTORY_CHANGED, syncHistory);

    // ── View ──────────────────────────────────────────────────────────────────
    // A hand button lived here. Dragging the map always pans now, so there is nothing to
    // switch.

    const zoomOutBtn = iconButton({
        id: 'tbZoomOut', icon: '−', title: 'Zoom out',
        onClick: () => { zoomBy(editor, 1 / ZOOM_STEP); syncZoom(); },
    });

    const zoomLabel = el('button', {
        id: 'tbZoomLevel',
        className: 'mode-button ui-btn tb-icon-btn tb-zoom-level',
        text: '100%',
        title: 'Reset the view to fit the whole map',
        onClick: () => { resetView(editor); syncZoom(); },
    });

    const zoomInBtn = iconButton({
        id: 'tbZoomIn', icon: '+', title: 'Zoom in',
        onClick: () => { zoomBy(editor, ZOOM_STEP); syncZoom(); },
    });

    const resetBtn = iconButton({
        id: 'tbResetView', icon: '⟲', title: 'Reset the view to fit the whole map',
        onClick: () => { resetView(editor); syncZoom(); },
    });

    const syncZoom = () => { zoomLabel.textContent = zoomLevel(editor) + '%'; };

    // The wheel and middle-drag change the view without going through these buttons, so
    // follow the viewBox itself rather than only updating on click.
    if (editor.svg) {
        new MutationObserver(syncZoom)
            .observe(editor.svg, { attributes: true, attributeFilter: ['viewBox'] });
    }
    // The fitted baseline only exists once the map has drawn and autoscaled.
    setTimeout(syncZoom, 0);

    const group = el('div', {
        className: 'tb-group',
        children: [
            undoBtn, redoBtn,
            el('span', { className: 'tb-sep' }),
            zoomOutBtn, zoomLabel, zoomInBtn, resetBtn,
            el('span', { className: 'tb-sep' }),
        ],
    });

    host.insertBefore(group, host.firstChild);
}
