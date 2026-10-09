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
 * Each one owns its own turning-off — clearing a half-picked hex, unregistering a map
 * handler, putting a label back — and a bare setMode('none') would leave all of that
 * behind. This is the behaviour the Escape handler already had; it is shared now rather
 * than copied.
 *
 * Right-click on a tile with nothing armed opens the tile menu instead, so "is anything
 * armed?" has one answer too — isAnythingArmed — and it must agree with what disarmAll
 * puts down. Anything it reports that disarmAll cannot clear would keep the menu away for
 * good: that is why the system picker's armed tile and a Shift+S swap are put down here
 * now, which right-click never used to reach.
 */

import { dismissGhost, isGhostArmed } from './pasteGhost.js';
import { isSwapModeActive, cancelSwapMode } from './tileSwap.js';
import { isDistanceToolArmed } from './distanceTool.js';
import { activeMode, deactivateModes } from '../core/registry.js';
import * as pickerState from '../modules/SystemPicker/pickerState.js';

const LIT_TOOLS = '.mode-button.active:not([data-launcher])';

/** The modes the map is idle in — HexEditor.setMode's own test. */
function isIdleMode(mode) {
    return !mode || mode === 'select' || mode === 'none';
}

/**
 * Whether anything would take the next map click — the question right-click asks before
 * choosing between "put it down" and "open the tile menu".
 *
 * @param {any} editor
 */
export function isAnythingArmed(editor) {
    return isGhostArmed()
        || !isIdleMode(editor?.mode)
        || !!activeMode()
        || document.querySelector(LIT_TOOLS) !== null
        || isSwapModeActive()
        || isDistanceToolArmed(editor)
        || pickerState.isArmed();
}

/**
 * @param {any} editor
 * @returns {'ghost'|'tools'} what was actually put down
 */
export function disarmAll(editor) {
    if (isGhostArmed()) {
        dismissGhost(editor);
        return 'ghost';
    }

    // Not a button marked data-launcher. It opens a panel of tools and is lit while one of
    // them is armed, so pressing it would close the panel rather than put the tool down;
    // the tool's own lit button is in the panel, and pressing that disarms it.
    const armed = document.querySelectorAll(LIT_TOOLS);
    if (armed.length) {
        armed.forEach(btn => /** @type {HTMLElement} */(btn).click());
    } else if (typeof editor?.setMode === 'function') {
        // Nothing is lit but something may still be set — a mode armed from a keyboard
        // shortcut, or a button that has since been rebuilt.
        editor.setMode('none');
    }
    // And every registered mode, for the tools whose armed state is not a lit button: the
    // value hints show theirs in inline colours, so there was nothing above to press.
    deactivateModes();
    // Neither of these is a lit button or a registered mode; only Escape reached them.
    if (isSwapModeActive()) cancelSwapMode(editor);
    if (pickerState.isArmed()) pickerState.disarm();
    return 'tools';
}
