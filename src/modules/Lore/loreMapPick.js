/**
 * Map-picking mode for the lore module: click a hex to edit its lore, right-click for a
 * per-planet menu.
 *
 * This replaces a cross-module handshake in uisectorControls.js that drove the lore popup by
 * filling #hexLabelInput and calling .click() on #selectHexBtn, with setTimeout retries to
 * paper over the popup not existing yet. That coupled the toolbar to the editor's DOM ids and
 * raced on slow loads. Here the toolbar just says "pick a hex, then call this", and the lore
 * module exposes openLoreEditor as a real function.
 *
 * uiEvents.js already early-returns for editor.mode === 'lore-selection', so a capture-phase
 * listener owning the click is the established pattern — nothing there needs changing.
 */

import { planetDisplayName } from '../../draw/hexAnchors.js';
import { openListPicker } from './loreEffectPickers.js';

let armed = false;
let previousMode = null;
let clickHandler = null;
let contextHandler = null;
let onPickCallback = null;

export function isLoreMapPickArmed() {
    return armed;
}

function hexLabelFromEvent(event) {
    const node = event.target.closest?.('[data-label]');
    return node ? node.getAttribute('data-label') : null;
}

/** openListPicker anchors to an element, so give it a zero-size one at the cursor. */
function anchorAt(clientX, clientY) {
    const anchor = document.createElement('div');
    anchor.style.cssText =
        `position:fixed;left:${clientX}px;top:${clientY}px;width:0;height:0;pointer-events:none`;
    document.body.appendChild(anchor);
    return anchor;
}

/** Right-click a hex: choose the system or one of its planets. */
async function pickTargetOnHex(editor, hexLabel, clientX, clientY) {
    const hex = editor.hexes?.[hexLabel];
    if (!hex) return null;

    const planets = hex.planets || [];
    if (!planets.length) return { kind: 'system', hexLabel };

    const items = [
        { value: 'system', label: `${hexLabel} — System` },
        ...planets.map((planet, i) => ({
            value: `planet:${i}`,
            label: planetDisplayName(planet, i)
        }))
    ];

    const anchor = anchorAt(clientX, clientY);
    try {
        const choice = await openListPicker(anchor, items,
            { title: 'Add lore to…', searchable: false, width: 220 });
        if (!choice) return null;
        if (choice === 'system') return { kind: 'system', hexLabel };
        return { kind: 'planet', hexLabel, planetIndex: Number(choice.split(':')[1]) };
    } finally {
        anchor.remove();
    }
}

function showHint(text) {
    let chip = document.getElementById('lore-pick-hint');
    if (!chip) {
        chip = document.createElement('div');
        chip.id = 'lore-pick-hint';
        chip.className = 'lore-pick-hint';
        document.body.appendChild(chip);
    }
    chip.textContent = text;
    chip.style.display = 'block';
}

function hideHint() {
    const chip = document.getElementById('lore-pick-hint');
    if (chip) chip.style.display = 'none';
}

/**
 * Start listening for hex picks. Idempotent — calling it again just replaces the callback,
 * so the toolbar button and the popup auto-arm can't fight over the listener.
 */
export function armLoreMapPick(editor, { onPick } = {}) {
    onPickCallback = onPick || null;
    if (armed) return;

    const svg = editor?.svg || document.querySelector('#hexMap');
    if (!svg) return;

    previousMode = editor.mode;
    editor.mode = 'lore-selection';

    clickHandler = (event) => {
        const label = hexLabelFromEvent(event);
        if (!label) return;
        event.preventDefault();
        event.stopPropagation();
        onPickCallback?.({ kind: 'system', hexLabel: label });
    };

    contextHandler = async (event) => {
        const label = hexLabelFromEvent(event);
        if (!label) return;
        event.preventDefault();
        event.stopPropagation();
        const ref = await pickTargetOnHex(editor, label, event.clientX, event.clientY);
        if (ref) onPickCallback?.(ref);
    };

    svg.addEventListener('click', clickHandler, true);
    svg.addEventListener('contextmenu', contextHandler, true);
    document.body.classList.add('lore-picking');
    showHint('Lore: click a hex — right-click for a planet');
    armed = true;
}

export function disarmLoreMapPick(editor) {
    if (!armed) return;
    const svg = editor?.svg || document.querySelector('#hexMap');
    if (svg) {
        if (clickHandler) svg.removeEventListener('click', clickHandler, true);
        if (contextHandler) svg.removeEventListener('contextmenu', contextHandler, true);
    }
    if (editor && previousMode !== null) editor.mode = previousMode;
    previousMode = null;
    clickHandler = null;
    contextHandler = null;
    onPickCallback = null;
    document.body.classList.remove('lore-picking');
    hideHint();
    armed = false;
}
