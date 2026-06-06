// src/features/tileSwap.js
// Swap the tile content of two hexes.
// Hyperlane matrix and positional links (customAdjacents, adjacencyOverrides,
// borderAnomalies) are intentionally NOT swapped — they are drawn infrastructure
// tied to hex position, not to the tile placed there.

import { sectorColors } from '../constants/constants.js';
import { redrawAllRealIDOverlays } from './realIDsOverlays.js';
import { updateTileImageLayer } from './imageSystemsOverlay.js';
import { redrawWormholeOverlays, removeWormholeOverlay } from './wormholes.js';
import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';

const SWAP_FIELDS = [
    'baseType', 'realId', 'planets',
    'effects', 'wormholes', 'customWormholes',
    'systemTokens', 'planetTokens',
    'systemLore', 'planetLore',
    'valueTarget',
];

function deepClone(v) {
    if (v === null || v === undefined) return v;
    if (v instanceof Set) return new Set(v);
    if (Array.isArray(v)) return v.map(deepClone);
    if (typeof v === 'object') return JSON.parse(JSON.stringify(v));
    return v;
}

function updateHexFill(hex) {
    if (!hex.polygon) return;
    hex.polygon.setAttribute('fill', sectorColors[hex.baseType] ?? sectorColors['']);
}

/**
 * Swap tile content between two hexes. Both hexes are saved to undo history first.
 */
export function swapHexes(editor, labelA, labelB) {
    const hexA = editor.hexes[labelA];
    const hexB = editor.hexes[labelB];
    if (!hexA || !hexB || labelA === labelB) return;

    editor.saveState(labelA);
    editor.saveState(labelB);

    // Snapshot both sides
    const snapA = {}, snapB = {};
    for (const f of SWAP_FIELDS) {
        snapA[f] = deepClone(hexA[f]);
        snapB[f] = deepClone(hexB[f]);
    }

    // Cross-apply
    for (const f of SWAP_FIELDS) {
        hexA[f] = snapB[f];
        hexB[f] = snapA[f];
    }

    // Update fills
    updateHexFill(hexA);
    updateHexFill(hexB);

    // Redraw wormhole icons
    removeWormholeOverlay(editor, labelA);
    removeWormholeOverlay(editor, labelB);
    redrawWormholeOverlays(editor, labelA);
    redrawWormholeOverlays(editor, labelB);

    // Redraw info overlays (planet types, R/I, realID labels)
    redrawAllRealIDOverlays(editor);

    // Redraw tile images
    updateTileImageLayer(editor);

    // Refresh token and lore overlays if active
    editor.tokenOverlay?.refresh?.();
    if (editor.loreOverlay?.isActive) editor.loreOverlay.refresh();

    enforceSvgLayerOrder(editor.svg);
}

// ── Swap mode ────────────────────────────────────────────────────────────────

const state = {
    active: false,
    firstLabel: null,
    prevOnHexClick: null,
    escHandler: null,
};

/**
 * Activate swap mode.
 * onStatus(msg) is called whenever the prompt changes.
 * oneShot: if true, automatically exits after one successful swap (keyboard path).
 *          if false (default, button path), stays active for multiple swaps.
 */
export function startSwapMode(editor, onStatus = () => {}, { oneShot = false, firstLabel = null } = {}) {
    if (state.active) return; // already active — do nothing

    state.active = true;
    state.firstLabel = null;
    state.prevOnHexClick = editor._onHexClick;

    // Keyboard path: pre-select the first hex immediately
    if (firstLabel && editor.hexes[firstLabel]) {
        state.firstLabel = firstLabel;
        editor.hexes[firstLabel].polygon?.classList.add('swap-selected');
        onStatus(`<b>${firstLabel}</b> selected — click the second tile to swap`);
    } else {
        onStatus('Click the <b>first</b> tile…');
    }

    editor._onHexClick = function(e, label) {
        if (!state.active) return;

        if (!state.firstLabel) {
            state.firstLabel = label;
            editor.hexes[label]?.polygon?.classList.add('swap-selected');
            onStatus(`<b>${label}</b> selected — click the <b>second</b> tile to swap`);
        } else if (label === state.firstLabel) {
            // Clicked same hex — deselect
            editor.hexes[label]?.polygon?.classList.remove('swap-selected');
            state.firstLabel = null;
            onStatus('Click the <b>first</b> tile…');
        } else {
            // Execute swap
            editor.hexes[state.firstLabel]?.polygon?.classList.remove('swap-selected');
            swapHexes(editor, state.firstLabel, label);
            if (oneShot) {
                cancelSwapMode(editor, onStatus);
            } else {
                state.firstLabel = null;
                onStatus('✓ Swapped — click another tile or Cancel');
            }
        }
    };

    state.escHandler = (e) => {
        if (e.key === 'Escape') cancelSwapMode(editor, onStatus);
    };
    document.addEventListener('keydown', state.escHandler);
}

export function cancelSwapMode(editor, onStatus = () => {}) {
    if (!state.active) return;
    if (state.firstLabel) {
        editor.hexes[state.firstLabel]?.polygon?.classList.remove('swap-selected');
    }
    editor._onHexClick = state.prevOnHexClick;
    document.removeEventListener('keydown', state.escHandler);
    state.active = false;
    state.firstLabel = null;
    state.prevOnHexClick = null;
    state.escHandler = null;
    onStatus('');
}

export function isSwapModeActive() { return state.active; }
