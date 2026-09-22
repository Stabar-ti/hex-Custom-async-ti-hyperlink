// @ts-check
/**
 * Putting everything down.
 *
 * Right-click and Escape both mean "stop what you are doing", and until now they meant
 * slightly different things: Escape disarmed the armed tool, right-click cancelled a
 * half-drawn hyperlane link, and the paste ghost had its own right-click handler bound to
 * the same element as the map's. Two listeners on one element cannot be ordered by
 * stopPropagation, so which of them ran first was an accident of import order.
 *
 * So the policy lives here, once, and both callers ask for it:
 *
 *   1. A paste ghost is the top of the stack. It is not a tool and nothing is armed while
 *      it is up, so dismissing it is the whole action — pressing again then disarms.
 *   2. Otherwise every armed tool is turned off, which puts the map back in select mode
 *      and hands it to panning.
 *
 * Tools are disarmed by clicking the lit buttons rather than by calling setMode directly.
 * Each one owns its own turning-off — clearing an inspector panel, unregistering a map
 * handler, putting a label back — and a bare setMode('none') would leave all of that
 * behind. This is the behaviour the Escape handler already had; it is shared now rather
 * than copied.
 */

import { dismissGhost, isGhostArmed } from './pasteGhost.js';

/**
 * @param {any} editor
 * @returns {'ghost'|'tools'} what was actually put down
 */
export function disarmAll(editor) {
    if (isGhostArmed()) {
        dismissGhost(editor);
        return 'ghost';
    }

    const armed = document.querySelectorAll('.mode-button.active');
    if (armed.length) {
        armed.forEach(btn => /** @type {HTMLElement} */(btn).click());
    } else if (typeof editor?.setMode === 'function') {
        // Nothing is lit but something may still be set — a mode armed from a keyboard
        // shortcut, or a button that has since been rebuilt.
        editor.setMode('none');
    }
    return 'tools';
}
