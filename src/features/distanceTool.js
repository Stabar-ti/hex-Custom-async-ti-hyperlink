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
 *
 * The reading outlives the tool: disarming leaves it on screen, so you can arm something
 * else and still read it. Clicking its source hex again puts it away, as Escape does.
 */

import { showDistanceOverlays, clearDistanceOverlays, distanceOverlaySource } from './baseOverlays.js';
import { registerMode, activateMode, deactivateMode } from '../core/registry.js';
import { showToast } from '../ui/uiToast.js';

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
    showDistanceOverlays(editor, result);

    // An empty answer used to look exactly like a tool that had not run. The usual reason
    // is the rule the engine deliberately keeps — an unpainted hex is not a tile, so it
    // cannot be moved through — and that is worth saying, since the blank grid a new map
    // starts from is entirely made of them.
    if (Object.keys(result).length <= 1) {
        showToast(
            `Nothing within ${editor.maxDistance} of ${label}. Unpainted hexes are not tiles, ` +
            'so movement cannot pass through them. The range is in Analyse ▸ Distance Options.',
            'info', 5000);
    }
}

/**
 * Show the distances from a hex, or put them away if they are already the ones on screen.
 * This is what a click does, from the armed tool and from Shift+D + right-click.
 *
 * @param {any} editor
 * @param {string} label
 */
export function toggleDistancesFrom(editor, label) {
    if (distanceOverlaySource(editor) === label) clearDistanceOverlays(editor);
    else showDistancesFrom(editor, label);
}

/** Typing in a field must not arm a tool. */
function isTypingTarget(target) {
    const el = /** @type {HTMLElement|null} */ (target);
    if (!el) return false;
    return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
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
        toggleDistancesFrom(editor, label);
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

    // D toggles the tool. Plain D only: Shift+D is still held for the right-click gesture
    // in svgBindings, and Ctrl/Cmd+D belongs to the browser.
    document.addEventListener('keydown', (ev) => {
        if (ev.key !== 'd' || ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.altKey) return;
        if (ev.repeat || isTypingTarget(ev.target)) return;
        ev.preventDefault();
        toggleDistanceTool(editor);
    });
}
