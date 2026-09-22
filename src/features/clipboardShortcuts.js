// @ts-check
/**
 * Ctrl+C, Ctrl+X, Ctrl+V, R, Escape — the keys everyone already knows.
 *
 * The wizard's equivalents were: open a popup, press a button, read a status line, click
 * hexes, release Shift, click again. Every one of those steps existed to tell the editor
 * something the keyboard says in two characters.
 *
 * Three rules keep this from fighting the rest of the page:
 *
 *   - nothing fires while the focus is in a text field, so typing "v" in the system search
 *     does not paste a block of tiles onto the map;
 *   - Ctrl+C and Ctrl+X only take the event when there is a map selection to act on,
 *     leaving the browser's own copy alone the rest of the time;
 *   - Escape is shared with several other tools, so this only handles it when there is a
 *     ghost to dismiss, and lets it through otherwise.
 */

import { selectedHexes, clearHexSelection } from './hexSelection.js';
import { copyTiles, activeClip, rotateActiveClip } from './tileClipboard.js';
import { armGhost, dismissGhost, isGhostArmed, drawGhost } from './pasteGhost.js';

/** Is the user typing into something? */
function inTextField() {
    const el = /** @type {any} */ (document.activeElement);
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = String(el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
}

/**
 * Copy or cut the current selection.
 * @param {any} editor @param {{cut?: boolean}} [opts]
 */
export function copySelectionToClipboard(editor, { cut = false } = {}) {
    const labels = selectedHexes(editor);
    if (!labels.length) return false;

    const clip = copyTiles(editor, labels, { cut });
    if (!clip) return false;

    // A cut has taken the tiles away, so the outline round where they were is describing
    // something that is no longer there.
    if (cut) clearHexSelection(editor);

    armGhost(editor);
    return true;
}

/**
 * Show the ghost again, ready to place.
 * @param {any} editor
 */
export function beginPaste(editor) {
    if (!activeClip()) return false;
    return armGhost(editor);
}

/**
 * Wire the keys and the right-click.
 *
 * @param {any} editor
 */
export function installClipboardShortcuts(editor) {
    if (!editor) return;

    document.addEventListener('keydown', (ev) => {
        if (inTextField()) return;

        const mod = ev.ctrlKey || ev.metaKey;

        if (mod && (ev.key === 'c' || ev.key === 'C')) {
            if (!selectedHexes(editor).length) return;   // let the browser have it
            ev.preventDefault();
            copySelectionToClipboard(editor, { cut: false });
            return;
        }

        if (mod && (ev.key === 'x' || ev.key === 'X')) {
            if (!selectedHexes(editor).length) return;
            ev.preventDefault();
            copySelectionToClipboard(editor, { cut: true });
            return;
        }

        if (mod && (ev.key === 'v' || ev.key === 'V')) {
            if (!activeClip()) return;
            ev.preventDefault();
            beginPaste(editor);
            return;
        }

        // Plain R turns the clip. Shift+R is taken — it clears the hovered hex — so this
        // deliberately does not fire with any modifier held.
        if ((ev.key === 'r' || ev.key === 'R') && !mod && !ev.shiftKey && !ev.altKey) {
            if (!isGhostArmed() || !activeClip()) return;
            ev.preventDefault();
            rotateActiveClip(editor, 1);
            if (editor.hoveredHexLabel) drawGhost(editor, editor.hoveredHexLabel);
            return;
        }

        if (ev.key === 'Escape') {
            // Shared with the distance overlays, the tools and the popups. Only claim it
            // when there is actually a ghost up.
            if (!isGhostArmed()) return;
            ev.stopPropagation();
            dismissGhost(editor);
        }
    // Capture, so Escape reaches this before the handlers that disarm every tool.
    }, true);

    // Right-click dismisses the ghost, and is swallowed so the context menu does not open
    // over the map while you are working.
    editor.svg?.addEventListener('contextmenu', (ev) => {
        if (!isGhostArmed()) return;
        ev.preventDefault();
        dismissGhost(editor);
    });
}
