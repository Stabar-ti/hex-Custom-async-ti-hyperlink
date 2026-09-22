// src/features/tileCopyPasteWizard.js
// Multi-tile copy/cut/paste wizard for hex map

import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';
import { redrawAllRealIDOverlays } from '../features/realIDsOverlays.js';
import { redrawBorderAnomaliesOverlay } from '../features/borderAnomaliesOverlay.js';
import { drawCustomAdjacencyLayer } from '../draw/customLinksDraw.js';
import { drawBorderAnomaliesLayer } from '../draw/borderAnomaliesDraw.js';
import { updateEffectsVisibility, updateWormholeVisibility } from '../features/baseOverlays.js';
import { updateTileImageLayer } from '../features/imageSystemsOverlay.js';
import { removeWormholeOverlay } from '../features/wormholes.js';
import { hideWizardPopup, showWizardInfoPopup, hideWizardInfoPopup } from '../ui/tileCopyPasteWizardUI.js';
import {
    captureTiles, rotateTiles, applyTiles, isEmptyHex,
    parseHyperlaneRealID, buildHyperlaneRealID,
} from './tileClipboardEngine.js';

let wizardState = {
    mode: null, // 'select', 'paste', null
    selectedLabels: [],
    tileData: [],
    origin: null,
    offset: { q: 0, r: 0 },
    cut: false,
    prevOnHexClick: null,
    editor: null,
    rotateSelection: null,
    selectionClickHandler: null,
    lastPastePreviewEvent: null,
    // --- Handler references for cleanup ---
    onPastePreview: null,
    onWheel: null,
    onKeyUp: null,
    cancelHandler: null,
};

export function startCopyPasteWizard(editor, cut = false) {
    if (wizardState.mode) return;
    wizardState.mode = 'select';
    wizardState.selectedLabels = [];
    wizardState.tileData = [];
    wizardState.origin = null;
    wizardState.offset = { q: 0, r: 0 };
    wizardState.cut = cut;
    wizardState.editor = editor;
    wizardState.prevOnHexClick = editor._onHexClick;

    // Deactivate all other tools/modes
    if (typeof editor.setMode === 'function') editor.setMode('none');
    clearHighlights(editor);
    // Show selection instructions as a SEPARATE info popup in the SVG, not in the wizard popup
    import('../ui/tileCopyPasteWizardUI.js').then(({ showWizardInfoPopup }) => {
        showWizardInfoPopup('SHIFT+Click to select connected tiles. Release SHIFT to finish.', [
            { label: 'Cancel', action: () => { hideWizardInfoPopup(); closeWizard(editor); } }
        ]);
    });
    // Do NOT clear the wizard popup here; keep the buttons visible
    // showWizardPopup('', []); // <-- Remove or comment out this line

    // Only allow selection via shift+click
    wizardState.selectionClickHandler = (e, label) => {
        if (wizardState.mode !== 'select') return;
        if (!e.shiftKey) return;
        if (!wizardState.selectedLabels.length) {
            wizardState.selectedLabels.push(label);
            wizardState.origin = editor.hexes[label];
        } else {
            const isAdjacentToAny = wizardState.selectedLabels.some(existingLabel =>
                areConnected(editor.hexes[existingLabel], editor.hexes[label])
            );
            if (isAdjacentToAny && !wizardState.selectedLabels.includes(label)) {
                wizardState.selectedLabels.push(label);
            }
        }
        updateHighlights(editor);
    };
    editor._onHexClick = wizardState.selectionClickHandler;

    // Listen for shift release to finish selection
    wizardState.onKeyUp = function (e) {
        if (e.key === 'Shift' && wizardState.mode === 'select') {
            finishSelection(editor);
        }
    };
    document.addEventListener('keyup', wizardState.onKeyUp);

    // Cancel on right click or cancel button
    wizardState.cancelHandler = function (e) {
        if (e.type === 'contextmenu') {
            e.preventDefault();
            if (wizardState.mode === 'select') {
                // Right-click during selection: step back by deselecting the last tile
                wizardState.selectedLabels.pop();
                if (!wizardState.selectedLabels.length) wizardState.origin = null;
                updateHighlights(editor);
                return;
            }
            if (wizardState.mode === 'paste') {
                // Return to selection mode — preserve current selection, let user adjust then re-paste
                wizardState.mode = 'select';
                wizardState.rotateSelection = null;
                clearPasteGhost(editor);
                if (wizardState.onPastePreview) {
                    editor.svg.removeEventListener('mousemove', wizardState.onPastePreview);
                    wizardState.onPastePreview = null;
                }
                if (wizardState.onWheel) {
                    editor.svg.removeEventListener('wheel', wizardState.onWheel);
                    wizardState.onWheel = null;
                }
                if (wizardState.selectionClickHandler) editor._onHexClick = wizardState.selectionClickHandler;
                hideWizardInfoPopup();
                document.getElementById('tilePasteInfoPreview')?.remove();
                const n = wizardState.selectedLabels.length;
                showWizardInfoPopup(
                    `${n} tile${n !== 1 ? 's' : ''} selected. SHIFT+Click to add more. Release SHIFT to paste.`,
                    [{ label: 'Cancel', action: () => { hideWizardInfoPopup(); closeWizard(editor); } }]
                );
                updateHighlights(editor);
            }
            // mode === null: nothing to do
            return;
        }
        if (e.type === 'click' && e.target.id === 'cancelWizardBtn') {
            e.preventDefault();
            closeWizard(editor);
        }
    };
    editor.svg.addEventListener('contextmenu', wizardState.cancelHandler);
    document.body.addEventListener('click', wizardState.cancelHandler);

    function finishSelection(editor) {
        if (!wizardState.selectedLabels.length) {
            showWizardInfoPopup('No tiles selected. SHIFT+Click a hex to begin.', [
                { label: 'Cancel', action: () => { hideWizardInfoPopup(); closeWizard(editor); } }
            ]);
            return;
        }
        wizardState.mode = 'paste';
        // Build minimal canonical data for each tile, respecting toggles
        const opts = window.tileCopyOptions || { wormholes: true, customAdjacents: true, borderAnomalies: true, tokens: true };
        wizardState.tileData = captureTiles(editor, wizardState.selectedLabels, opts);
        // Clear selection highlights before showing paste preview
        clearHighlights(editor);
        // Warn if copying (not cutting) any realID tile with planets
        if (!wizardState.cut && wizardState.selectedLabels.some(label => {
            const hex = editor.hexes[label];
            return hex && hex.realId && hex.planets && hex.planets.length > 0;
        })) {
            // Use info popup instead of main wizard popup
            import('../ui/tileCopyPasteWizardUI.js').then(({ showWizardInfoPopup }) => {
                showWizardInfoPopup(
                    'Warning: Systems containing planets can only exist once in the map. Duplicating these may cause errors or unexpected behavior.',
                    [
                        {
                            label: 'Continue', action: () => {
                                hideWizardInfoPopup();
                                showWizardInfoPopup('Move mouse to preview. Left click to paste. Hold Alt+scroll to rotate.', [
                                    { label: 'Cancel', action: () => { hideWizardInfoPopup(); closeWizard(editor); } }
                                ]);
                                updateHighlights(editor, true);
                                setupPaste();
                            }
                        },
                        { label: 'Cancel', action: () => { hideWizardInfoPopup(); closeWizard(editor); } }
                    ]
                );
            });
            return;
        }
        showWizardInfoPopup('Move mouse to preview. Left click to paste. Hold Alt+scroll to rotate.', [
            { label: 'Cancel', action: () => { hideWizardInfoPopup(); closeWizard(editor); } }
        ]);
        updateHighlights(editor, true);
        setupPaste();

        function setupPaste() {
            wizardState.onPastePreview = function pastePreviewHandler(e) {
                if (wizardState.mode !== 'paste') return;
                clearPasteGhost(editor);
                const poly = e.target.closest('polygon');
                if (!poly) return;
                const destLabel = poly.dataset.label;
                const destHex = editor.hexes[destLabel];
                if (!destHex) return;
                const dq = destHex.q - wizardState.origin.q;
                const dr = destHex.r - wizardState.origin.r;
                wizardState.offset = { q: dq, r: dr };
                wizardState.lastPastePreviewEvent = e;
                for (const data of wizardState.tileData) {
                    if (!data) continue;
                    const q = data.q + dq;
                    const r = data.r + dr;
                    const dest = Object.values(editor.hexes).find(h => h.q === q && h.r === r);
                    if (dest && dest.polygon) dest.polygon.classList.add('tile-paste-ghost');
                }
            };
            editor.svg.addEventListener('mousemove', wizardState.onPastePreview);
            editor._onHexClick = onPasteConfirm;
            wizardState.onWheel = function onWheelRotate(e) {
                if (wizardState.mode !== 'paste') return;
                if (!e.altKey) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                const dir = e.deltaY < 0 ? 1 : -1;
                rotateSelection(dir);
                clearPasteGhost(editor);
                if (wizardState.lastPastePreviewEvent) {
                    wizardState.onPastePreview(wizardState.lastPastePreviewEvent);
                }
            };
            editor.svg.addEventListener('wheel', wizardState.onWheel, { passive: false });
            wizardState.rotateSelection = rotateSelection;
        }

        function rotateSelection(dir) {
            rotateTiles(editor, wizardState.tileData, wizardState.origin, dir);
        }
    }

    function onPasteConfirm(e, destLabel) {
        if (wizardState.mode !== 'paste') return;
        const destHex = editor.hexes[destLabel];
        if (!destHex) return;
        const dq = destHex.q - wizardState.origin.q;
        const dr = destHex.r - wizardState.origin.r;
        // Check for overwrite
        let willOverwrite = false;
        for (const data of wizardState.tileData) {
            if (!data) continue;
            const q = data.q + dq;
            const r = data.r + dr;
            const dest = Object.values(editor.hexes).find(h => h.q === q && h.r === r);
            if (dest && !isEmptyHex(dest)) willOverwrite = true;
        }
        if (willOverwrite && !window.confirm('Some destination tiles are not empty. Overwrite?')) {
            return;
        }
        editor.beginUndoGroup?.();
        applyTiles(editor, wizardState.tileData, dq, dr);
        // ---- CUT FUNCTIONALITY: Snapshot and clear source tiles inside the same undo group ----
        if (wizardState.cut) {
            for (const label of wizardState.selectedLabels) {
                if (editor.hexes[label]) {
                    editor.saveState(label);
                    removeWormholeOverlay(editor, label);
                    editor.clearAll(label);
                }
            }
        }

        editor.commitUndoGroup?.();
        clearPasteGhost(editor);

        if (wizardState.cut) {
            wizardState.mode = null;
            wizardState.rotateSelection = null;
            clearHighlights(editor);
            clearPasteGhost(editor);
            if (wizardState.onPastePreview) {
                editor.svg.removeEventListener('mousemove', wizardState.onPastePreview);
                wizardState.onPastePreview = null;
            }
            if (wizardState.onWheel) {
                editor.svg.removeEventListener('wheel', wizardState.onWheel);
                wizardState.onWheel = null;
            }
            if (wizardState.prevOnHexClick) editor._onHexClick = wizardState.prevOnHexClick;
            document.getElementById('tilePasteInfoPreview')?.remove();
        }

        hideWizardInfoPopup();

        // Refresh all overlays once (after paste and after cut clears originals)
        redrawAllRealIDOverlays(editor);
        drawCustomAdjacencyLayer(editor);
        drawBorderAnomaliesLayer(editor);
        redrawBorderAnomaliesOverlay(editor);
        updateEffectsVisibility(editor);
        updateWormholeVisibility(editor);
        updateTileImageLayer(editor);
        if (editor.tokenOverlay) editor.tokenOverlay.refresh();
        enforceSvgLayerOrder(editor.svg);
        if (editor.loreOverlay && editor.loreOverlay.isActive) editor.loreOverlay.refresh();
    }
}


function closeWizard(editor) {
    wizardState.mode = null;
    clearHighlights(editor); // clears both selection and paste overlays
    clearPasteGhost(editor); // extra safety: always clear paste overlays
    hideWizardPopup();
    // Remove listeners and restore click handler
    if (wizardState.onPastePreview) {
        editor.svg.removeEventListener('mousemove', wizardState.onPastePreview);
        wizardState.onPastePreview = null;
    }
    if (wizardState.onWheel) {
        editor.svg.removeEventListener('wheel', wizardState.onWheel);
        wizardState.onWheel = null;
    }
    if (wizardState.onKeyUp) document.removeEventListener('keyup', wizardState.onKeyUp);
    if (wizardState.cancelHandler) {
        editor.svg.removeEventListener('contextmenu', wizardState.cancelHandler);
        document.body.removeEventListener('click', wizardState.cancelHandler);
    }
    if (wizardState.prevOnHexClick) editor._onHexClick = wizardState.prevOnHexClick;
    wizardState.editor = null;
    wizardState.rotateSelection = null;
    wizardState.selectionClickHandler = null;
    if (typeof editor.setMode === 'function') editor.setMode('hyperlane');
    // Remove floating info box if present
    document.getElementById('tilePasteInfoPreview')?.remove();
    // Extra cleanup: force overlays clear
    setTimeout(() => {
        clearHighlights(editor);
        clearPasteGhost(editor);
        forceClearPasteGhostSVG(editor);
    }, 0);
}

function forceClearPasteGhostSVG(editor) {
    // Remove .tile-paste-ghost from all polygons in the SVG
    const polygons = editor.svg.querySelectorAll('polygon.tile-paste-ghost');
    polygons.forEach(poly => poly.classList.remove('tile-paste-ghost'));
}

function areConnected(hexA, hexB) {
    // Hexes are connected if they are neighbors (axial distance 1)
    if (!hexA || !hexB) return false;
    const dq = Math.abs(hexA.q - hexB.q);
    const dr = Math.abs(hexA.r - hexB.r);
    const ds = Math.abs((hexA.s || -hexA.q - hexA.r) - (hexB.s || -hexB.q - hexB.r));
    return (dq + dr + ds) === 2;
}

function updateHighlights(editor, paste = false) {
    // During selection: highlight selected tiles
    // During paste preview: highlight original selection AND paste ghost
    for (const hex of Object.values(editor.hexes)) {
        if (!hex.polygon) continue;
        // Always clear both overlays first
        hex.polygon.classList.remove('tile-selection-highlight');
        hex.polygon.classList.remove('tile-paste-ghost');
    }
    if (!paste) {
        // Selection phase: highlight selected
        for (const label of wizardState.selectedLabels) {
            const hex = editor.hexes[label];
            if (hex && hex.polygon) hex.polygon.classList.add('tile-selection-highlight');
        }
    } else {
        // Paste preview phase: highlight original selection and paste ghost
        for (const label of wizardState.selectedLabels) {
            const hex = editor.hexes[label];
            if (hex && hex.polygon) hex.polygon.classList.add('tile-selection-highlight');
        }
        // Paste ghost overlays are handled by onPastePreview
    }
}

function clearHighlights(editor) {
    for (const hex of Object.values(editor.hexes)) {
        if (hex.polygon) hex.polygon.classList.remove('tile-selection-highlight');
        if (hex.polygon) hex.polygon.classList.remove('tile-paste-ghost');
    }
}

function clearPasteGhost(editor) {
    for (const hex of Object.values(editor.hexes)) {
        if (hex.polygon) hex.polygon.classList.remove('tile-paste-ghost');
    }
}

// hasMirror, forEachMirroredNeighbor, clearBorderAnomalyMirrors, applyBorderAnomalyMirrors,
// isEmptyHex and the two hyperlane realID helpers now live in tileClipboardEngine.js,
// beside the capture and apply code that is their only caller.

// --- Expose logic/state for UI file ---
// The two realID helpers are re-exported rather than moved out of reach: the UI module
// imports them from here.
export { wizardState, parseHyperlaneRealID, buildHyperlaneRealID };

// --- Remove automatic UI setup on load to prevent premature popup display ---
// setupTileCopySingleButtonAndPopup();

// Listen for wizard-rotate events from the popup UI
window.addEventListener('wizard-rotate', (e) => {
    if (wizardState.mode === 'paste' && typeof wizardState.rotateSelection === 'function') {
        wizardState.rotateSelection(e.detail);
        if (wizardState.editor) clearPasteGhost(wizardState.editor);
        if (typeof wizardState.onPastePreview === 'function' && wizardState.lastPastePreviewEvent) {
            wizardState.onPastePreview(wizardState.lastPastePreviewEvent);
        }
    }
});
