// @ts-check
/**
 * Distance as a tool you can pick, rather than a gesture you have to know.
 *
 * The editor could already compute reachability from a hex — but only by holding Shift+D
 * and then *right*-clicking, a combination advertised nowhere except the help popup. Its
 * settings, meanwhile, had one of the widest buttons in the top bar. The options were
 * prominent and the feature was invisible, which is the inversion this whole pass is about.
 *
 * The gesture still works; this adds a way to reach it that does not depend on knowing it.
 * Armed, a left-click on any hex paints the distances from that hex, and the tool stays on
 * so you can compare several — checking one slice against another is the usual reason to
 * want this at all.
 *
 * The click is taken in the capture phase, the same way the system picker takes its
 * placement click, so an armed distance tool does not also paint the hex with whatever
 * sector mode happens to be selected.
 */

import { showDistanceOverlays, clearDistanceOverlays } from './baseOverlays.js';
import { registerMode, activateMode, deactivateMode } from '../core/registry.js';

export const MODE_DISTANCE = 'distance';

/** @type {((ev: MouseEvent) => void) | null} */
let clickHandler = null;

/** @type {(() => void) | null} */
let onStateChange = null;

/** Fired when the tool is armed or disarmed, so a button can follow it. */
export const DISTANCE_TOOL_CHANGED = 'ti4:distance-tool-changed';

function announce(armed) {
    document.dispatchEvent(new CustomEvent(DISTANCE_TOOL_CHANGED, { detail: { armed } }));
    if (onStateChange) onStateChange();
}

/** @param {any} editor */
export function isDistanceToolArmed(editor) {
    return !!editor?._distanceToolArmed;
}

/**
 * Compute and show distances from one hex.
 *
 * @param {any} editor
 * @param {string} label
 */
export function showDistancesFrom(editor, label) {
    if (typeof editor.calculateDistancesFrom !== 'function') {
        console.warn('[distance] editor.calculateDistancesFrom is missing');
        return;
    }
    const result = editor.calculateDistancesFrom(label, editor.maxDistance);
    clearDistanceOverlays(editor);
    showDistanceOverlays(editor, result);
}

/** @param {any} editor */
export function armDistanceTool(editor) {
    if (editor._distanceToolArmed) return;
    const svg = editor.svg;
    if (!svg) return;

    editor._distanceToolArmed = true;

    clickHandler = (ev) => {
        const target = /** @type {Element|null} */ (ev.target);
        const hex = target?.closest?.('polygon[data-label], [data-label]');
        const label = hex?.getAttribute('data-label');
        if (!label) return;
        // Take the click before the paint handlers further down see it.
        ev.preventDefault();
        ev.stopPropagation();
        showDistancesFrom(editor, label);
    };
    svg.addEventListener('click', clickHandler, true);

    // After activateMode, not before: it disarms the other modes, and token mode's
    // teardown resets svg.style.cursor — which would wipe the crosshair.
    activateMode(MODE_DISTANCE);
    svg.style.cursor = 'crosshair';
    announce(true);
}

/** @param {any} editor */
export function disarmDistanceTool(editor) {
    if (!editor?._distanceToolArmed) return;
    editor._distanceToolArmed = false;

    if (clickHandler && editor.svg) {
        editor.svg.removeEventListener('click', clickHandler, true);
        editor.svg.style.cursor = '';
    }
    clickHandler = null;

    // The overlays are the answer the user asked for, so leave them on screen. Escape
    // clears them, as it always has.
    announce(false);
}

/** @param {any} editor */
export function toggleDistanceTool(editor) {
    if (isDistanceToolArmed(editor)) deactivateMode(MODE_DISTANCE);
    else armDistanceTool(editor);
}

/**
 * Register the tool with the exclusive-mode registry, so arming anything else disarms it
 * and vice versa.
 *
 * @param {any} editor
 * @param {() => void} [onChange] - called whenever the armed state changes
 */
export function installDistanceTool(editor, onChange) {
    onStateChange = onChange || null;
    registerMode(MODE_DISTANCE, { deactivate: () => disarmDistanceTool(editor) });
}
