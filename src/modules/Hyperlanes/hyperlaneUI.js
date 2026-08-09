/**
 * Assembly for the hyperlane module: installs the state accessors, the editor-facing
 * methods the rest of the app calls, and the Escape handler.
 *
 * Hyperlane editing deliberately does NOT take ownership of map clicks the way the system
 * picker does. pickerPlacement.js attaches a capture-phase listener with stopPropagation
 * because arming a tile is transient and modal — it is off almost all the time, and while
 * it is on, a click should do one thing only. Hyperlane mode is the opposite: it is the
 * editor's startup default (HexEditor.js:72), so a capture handler would swallow every map
 * click from page load — hover info, the copy/paste wizard, distance calculation, and the
 * picker's own capture listener, whose relative order would come down to which module
 * main.js happened to install first. An ambient mode belongs in the mode dispatcher, so
 * uiEvents.js keeps routing to us and simply delegates instead of reaching into our state.
 */

import * as state from './hyperlaneState.js';
import { cancelGesture, deleteAllSegments, selectHex, tryCompleteSegment } from './hyperlaneEditing.js';
import { ensureHyperlaneLayer, renderAll } from './hyperlaneRender.js';
import { installIndicator, refreshIndicator } from './hyperlaneIndicator.js';

let escapeHandler = null;

/**
 * Re-points `editor.selectedPath`, `.linking` and `.unlinking` at the store.
 *
 * These were plain fields written from four unrelated files. Exposing them as accessors
 * keeps every one of those call sites working verbatim while giving the gesture a single
 * owner. Must run AFTER any constructor assignment of the same names, or the plain
 * assignment shadows the accessor — which is why HexEditor.js no longer sets them.
 */
function installStateAccessors(editor) {
    Object.defineProperty(editor, 'selectedPath', {
        get: () => state.getPath(),
        set(v) { state.setPath(v); },
        configurable: true
    });
    Object.defineProperty(editor, 'linking', {
        get: () => state.isEnabled(),
        set(v) { state.setEnabled(v); },
        configurable: true
    });
    Object.defineProperty(editor, 'unlinking', {
        get: () => state.isUnlinking(),
        set(v) { state.setUnlinking(v); },
        configurable: true
    });
}

/**
 * Escape abandons a half-drawn path.
 *
 * Right-click already did this (svgBindings.js:92-98) but nothing says so anywhere in the
 * UI, and Escape is the reflex. Bubble phase, not capture: unlike the picker's Escape this
 * is not trying to win against anything, and it must not stop Escape from also closing a
 * popup or clearing the distance overlay.
 */
function installEscape(editor) {
    if (escapeHandler) document.removeEventListener('keydown', escapeHandler);
    escapeHandler = event => {
        if (event.key !== 'Escape') return;
        if (!state.getPathLength()) return;
        cancelGesture(editor);
    };
    document.addEventListener('keydown', escapeHandler);
}

/**
 * Wires hyperlane editing onto an editor instance. Called once from the HexEditor
 * constructor.
 *
 * @param {HexEditor} editor
 */
export function installHyperlanes(editor) {
    installStateAccessors(editor);
    installEscape(editor);
    installIndicator(editor);

    // The indicator hides itself outside hyperlane mode, and `mode` is a plain field the
    // store cannot observe — so nudge it when the tool changes.
    const setMode = editor.setMode?.bind(editor);
    if (setMode) {
        editor.setMode = function (mode) {
            setMode(mode);
            refreshIndicator();
        };
    }

    // Editor-facing surface. These names are called from uiEvents, svgBindings, history,
    // import, assignSystem and the copy/paste wizard, so they stay as thin delegates.
    editor._selectHex = function (label) { selectHex(this, label); };
    editor._tryDrawLink = function () { tryCompleteSegment(this); };
    editor.deleteAllSegments = function (label) { deleteAllSegments(this, label); };

    /** Redraw every hex's links — after generateMap or a bulk import. */
    editor.renderHyperlanes = function () { renderAll(this); };

    /** Make sure the layer exists, e.g. after the SVG has been rebuilt. */
    editor.ensureHyperlaneLayer = function () { return ensureHyperlaneLayer(this.svg); };
}
