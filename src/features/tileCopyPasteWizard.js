// src/features/tileCopyPasteWizard.js
// Multi-tile copy/cut/paste wizard for hex map

import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';
import { redrawAllRealIDOverlays } from '../features/realIDsOverlays.js';
import { redrawBorderAnomaliesOverlay } from '../features/borderAnomaliesOverlay.js';
import { drawCustomAdjacencyLayer } from '../draw/customLinksDraw.js';
import { drawBorderAnomaliesLayer } from '../draw/borderAnomaliesDraw.js';
import { updateEffectsVisibility, updateWormholeVisibility } from '../features/baseOverlays.js';
import { updateTileImageLayer } from '../features/imageSystemsOverlay.js';
import { markRealIDUsed } from '../ui/uiFilters.js';
import { drawMatrixLinks } from '../features/hyperlanes.js';
import { isMatrixEmpty } from '../utils/matrix.js';
import { toggleWormhole, updateHexWormholes, removeWormholeOverlay } from '../features/wormholes.js';
import { assignSystem } from '../features/assignSystem.js';
import { showWizardPopup, hideWizardPopup, showWizardInfoPopup, hideWizardInfoPopup, setupTileCopySingleButtonAndPopup } from '../ui/tileCopyPasteWizardUI.js';

let wizardState = {
    mode: null, // 'select', 'paste', null
    selectedLabels: [],
    tileData: [],
    origin: null,
    offset: { q: 0, r: 0 },
    cut: false,
    prevOnHexClick: null,
    // --- Handler references for cleanup ---
    onPastePreview: null,
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
    editor._onHexClick = (e, label) => {
        if (wizardState.mode !== 'select') return;
        if (!e.shiftKey) return;
        if (!wizardState.selectedLabels.length) {
            wizardState.selectedLabels.push(label);
            wizardState.origin = editor.hexes[label];
        } else {
            // Only allow connected tiles
            const last = editor.hexes[wizardState.selectedLabels[wizardState.selectedLabels.length - 1]];
            if (areConnected(last, editor.hexes[label])) {
                if (!wizardState.selectedLabels.includes(label)) {
                    wizardState.selectedLabels.push(label);
                }
            }
        }
        updateHighlights(editor);
    };

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
            // Only release paste mode and overlays, do NOT close the main wizard popup
            wizardState.mode = null;
            clearHighlights(editor);
            clearPasteGhost(editor);
            // Remove listeners for paste preview and wheel
            if (wizardState.onPastePreview) {
                editor.svg.removeEventListener('mousemove', wizardState.onPastePreview);
                wizardState.onPastePreview = null;
            }
            if (wizardState.onWheel) {
                editor.svg.removeEventListener('wheel', wizardState.onWheel);
                wizardState.onWheel = null;
            }
            // Restore click handler
            if (wizardState.prevOnHexClick) editor._onHexClick = wizardState.prevOnHexClick;
            // Remove floating info box if present
            document.getElementById('tilePasteInfoPreview')?.remove();
            // Do NOT hideWizardPopup();
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
        if (!wizardState.selectedLabels.length) return closeWizard(editor);
        wizardState.mode = 'paste';
        // Build minimal canonical data for each tile, respecting toggles
        const opts = window.tileCopyOptions || { wormholes: true, customAdjacents: true, borderAnomalies: true };
        wizardState.tileData = wizardState.selectedLabels.map(label => {
            const hex = editor.hexes[label];
            if (!hex) return null;
            // RealID tile
            if (hex.realId) {
                let matrix = hex.matrix ? JSON.parse(JSON.stringify(hex.matrix)) : Array.from({ length: 6 }, () => Array(6).fill(0));
                let links = hex.links ? JSON.parse(JSON.stringify(hex.links)) : matrix;
                return {
                    type: 'realID',
                    realId: hex.realId,
                    // Only store custom wormholes - inherent ones will be restored from system data
                    customWormholes: opts.wormholes ? Array.from(hex.customWormholes || []) : [],
                    links,
                    matrix,
                    effects: hex.effects ? Array.from(hex.effects) : [],
                    customAdjacents: opts.customAdjacents && hex.customAdjacents ? JSON.parse(JSON.stringify(hex.customAdjacents)) : undefined,
                    adjacencyOverrides: hex.adjacencyOverrides ? JSON.parse(JSON.stringify(hex.adjacencyOverrides)) : undefined,
                    borderAnomalies: opts.borderAnomalies && hex.borderAnomalies ? JSON.parse(JSON.stringify(hex.borderAnomalies)) : undefined,
                    label,
                    q: hex.q,
                    r: hex.r
                };
            }
            // Hyperlane tile: matrix present and not empty, but no realId/baseType
            if (hex.matrix && !isMatrixEmpty(hex.matrix) && !hex.baseType && !hex.realId) {
                return {
                    type: 'hyperlane',
                    links: JSON.parse(JSON.stringify(hex.matrix)),
                    matrix: JSON.parse(JSON.stringify(hex.matrix)),
                    effects: hex.effects ? Array.from(hex.effects) : [],
                    customAdjacents: opts.customAdjacents && hex.customAdjacents ? JSON.parse(JSON.stringify(hex.customAdjacents)) : undefined,
                    adjacencyOverrides: hex.adjacencyOverrides ? JSON.parse(JSON.stringify(hex.adjacencyOverrides)) : undefined,
                    borderAnomalies: opts.borderAnomalies && hex.borderAnomalies ? JSON.parse(JSON.stringify(hex.borderAnomalies)) : undefined,
                    label,
                    q: hex.q,
                    r: hex.r
                };
            }
            // BaseType tile
            if (hex.baseType) {
                return {
                    type: 'baseType',
                    baseType: hex.baseType,
                    // For baseType tiles, store all wormholes as custom (since they don't have inherent ones)
                    customWormholes: opts.wormholes ? Array.from(hex.customWormholes || []) : [],
                    links: hex.matrix ? JSON.parse(JSON.stringify(hex.matrix)) : undefined,
                    matrix: hex.matrix ? JSON.parse(JSON.stringify(hex.matrix)) : undefined,
                    effects: hex.effects ? Array.from(hex.effects) : [],
                    customAdjacents: opts.customAdjacents && hex.customAdjacents ? JSON.parse(JSON.stringify(hex.customAdjacents)) : undefined,
                    adjacencyOverrides: hex.adjacencyOverrides ? JSON.parse(JSON.stringify(hex.adjacencyOverrides)) : undefined,
                    borderAnomalies: opts.borderAnomalies && hex.borderAnomalies ? JSON.parse(JSON.stringify(hex.borderAnomalies)) : undefined,
                    label,
                    q: hex.q,
                    r: hex.r
                };
            }
            // Fallback: empty tile
            return {
                type: 'empty',
                label,
                q: hex.q,
                r: hex.r
            };
        });
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
                                showWizardInfoPopup('Move mouse to preview. Left click to paste.', [
                                    { label: 'Cancel', action: () => { hideWizardInfoPopup(); closeWizard(editor); } }
                                ]);
                                updateHighlights(editor, true);
                                setupPastePreviewAndRotation();
                            }
                        },
                        { label: 'Cancel', action: () => { hideWizardInfoPopup(); closeWizard(editor); } }
                    ]
                );
            });
            return;
        }
        showWizardInfoPopup('Move mouse to preview. Left click to paste.', [
            { label: 'Cancel', action: () => { hideWizardInfoPopup(); closeWizard(editor); } }
        ]);
        updateHighlights(editor, true);
        setupPastePreviewAndRotation();

        function setupPastePreviewAndRotation() {
            // Now handle paste preview & actual paste
            wizardState.onPastePreview = function pastePreviewHandler(e) {
                if (wizardState.mode !== 'paste') return; // guard: do nothing if not in paste mode
                clearPasteGhost(editor); // always clear overlays before drawing new ones
                const poly = e.target.closest('polygon');
                if (!poly) return;
                const destLabel = poly.dataset.label;
                const destHex = editor.hexes[destLabel];
                if (!destHex) return;
                const dq = destHex.q - wizardState.origin.q;
                const dr = destHex.r - wizardState.origin.r;
                wizardState.offset = { q: dq, r: dr };
                // --- Store last event for rotation overlay update ---
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
                if (!e.altKey) return; // Only rotate if Alt is held
                e.preventDefault();
                e.stopImmediatePropagation(); // Prevent map zoom handler from running
                const dir = e.deltaY < 0 ? 1 : -1; // up: +60°, down: -60°
                rotateSelection(dir);
                clearPasteGhost(editor);
                // Redraw ghost overlay at new orientation using last mouse event
                if (typeof wizardState.onPastePreview === 'function' && wizardState.lastPastePreviewEvent) {
                    wizardState.onPastePreview(wizardState.lastPastePreviewEvent);
                }
            };
            editor.svg.addEventListener('wheel', wizardState.onWheel, { passive: false });
        }
        // --- ROTATE SUPPORT: Alt+Mouse wheel rotates selection during paste preview ---
        let lastPastePreviewLabel = null;
        wizardState.onPastePreview = function pastePreviewHandler(e) {
            if (wizardState.mode !== 'paste') return; // guard: do nothing if not in paste mode
            clearPasteGhost(editor); // always clear overlays before drawing new ones
            const poly = e.target.closest('polygon');
            if (!poly) return;
            const destLabel = poly.dataset.label;
            lastPastePreviewLabel = destLabel;
            const destHex = editor.hexes[destLabel];
            if (!destHex) return;
            const dq = destHex.q - wizardState.origin.q;
            const dr = destHex.r - wizardState.origin.r;
            wizardState.offset = { q: dq, r: dr };
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
            if (!e.altKey) return; // Only rotate if Alt is held
            e.preventDefault();
            e.stopImmediatePropagation(); // Prevent map zoom handler from running
            const dir = e.deltaY < 0 ? 1 : -1; // up: +60°, down: -60°
            rotateSelection(dir);
            clearPasteGhost(editor);
            // Redraw ghost overlay at new orientation using last mouse event
            if (typeof wizardState.onPastePreview === 'function' && wizardState.lastPastePreviewEvent) {
                wizardState.onPastePreview(wizardState.lastPastePreviewEvent);
            }
        };
        editor.svg.addEventListener('wheel', wizardState.onWheel, { passive: false });

        function rotateSelection(dir) {
            // dir: +1 = 60° clockwise, -1 = 60° counterclockwise
            const center = wizardState.origin;
            wizardState.tileData.forEach(tile => {
                if (!tile) return;
                const rel = axialSub(tile, center);
                const rot = rotateAxial(rel, dir);
                tile.q = rot.q + center.q;
                tile.r = rot.r + center.r;
                // Rotate edge-related data
                rotateEdgeData(tile, dir);
                // --- If this is a realID hyperlane, update its rotation designator ---
                if (tile.realId) {
                    // Only apply rotation logic if this tile has non-empty hyperlane logic (matrix/links)
                    const hasHyperlaneLogic = (tile.matrix && !isMatrixEmpty(tile.matrix)) || (tile.links && !isMatrixEmpty(tile.links));
                    if (hasHyperlaneLogic) {
                        console.debug('[rotateSelection] BEFORE parse:', { realId: tile.realId });
                        const parsed = parseHyperlaneRealID(tile.realId);
                        console.debug('[rotateSelection] AFTER parse:', { parsed });
                        if (parsed.style) {
                            let newRot = parsed.rot + dir;
                            let cleanBase = parsed.base.replace(/-+$/, ''); // extra safety
                            console.debug('[rotateSelection] cleanBase:', { cleanBase, newRot, style: parsed.style });
                            const rebuilt = buildHyperlaneRealID(cleanBase, newRot, parsed.style, editor);
                            console.debug('[rotateSelection] buildHyperlaneRealID result:', { rebuilt });
                            tile.realId = rebuilt;
                            // Optionally, update matrix/links from sectorIDLookup or hyperlaneMatrices if available
                            let lookupId = tile.realId.toUpperCase();
                            let info = editor.sectorIDLookup && editor.sectorIDLookup[lookupId];
                            if (info && info.matrix) {
                                tile.matrix = JSON.parse(JSON.stringify(info.matrix));
                                tile.links = JSON.parse(JSON.stringify(info.matrix));
                            } else if (editor.hyperlaneMatrices && editor.hyperlaneMatrices[lookupId.toLowerCase()]) {
                                let matrix = editor.hyperlaneMatrices[lookupId.toLowerCase()];
                                tile.matrix = matrix.map(row => [...row]);
                                tile.links = tile.matrix;
                            } else {
                                // Fallback: rotate the matrix as before
                                // (already done by rotateEdgeData)
                            }
                        }
                    }
                }
            });
        }
        function axialSub(a, b) { return { q: a.q - b.q, r: a.r - b.r }; }
        function rotateAxial(pos, dir) {
            // 60° hex rotation: (q, r) => (-r, -s) or (-s, -q) depending on dir
            // s = -q - r
            if (dir === 1) return { q: -pos.r, r: -(-pos.q - pos.r) };
            if (dir === -1) return { q: -(-pos.q - pos.r), r: -pos.q };
            return pos;
        }
        function rotateEdgeData(tile, dir) {
            // Rotate arrays of length 6 (edges): borderAnomalies, customAdjacents, adjacencyOverrides
            const rotateArr = arr => Array.isArray(arr) && arr.length === 6 ? arr.map((_, i, a) => a[(i - (dir) + 6) % 6]) : arr;
            // --- Matrix and links: rotate both rows and columns ---
            function rotateMatrix(mat, dir) {
                if (!Array.isArray(mat) || mat.length !== 6) return mat;
                const out = Array.from({ length: 6 }, () => Array(6).fill(0));
                for (let i = 0; i < 6; ++i) for (let j = 0; j < 6; ++j) {
                    const ni = (i + dir + 6) % 6;
                    const nj = (j + dir + 6) % 6;
                    out[ni][nj] = mat[i][j];
                }
                return out;
            }
            if (tile.matrix) tile.matrix = rotateMatrix(tile.matrix, dir);
            if (tile.links) tile.links = rotateMatrix(tile.links, dir);
            if (tile.borderAnomalies) tile.borderAnomalies = rotateArr(tile.borderAnomalies);
            if (tile.customAdjacents) tile.customAdjacents = rotateArr(tile.customAdjacents);
            if (tile.adjacencyOverrides) tile.adjacencyOverrides = rotateArr(tile.adjacencyOverrides);
        }
        // --- Remove wheel handler on wizard close ---
        const origCloseWizard = closeWizard;
        closeWizard = function (editor) {
            editor.svg.removeEventListener('wheel', wizardState.onWheel);
            origCloseWizard(editor);
        };
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
        // --- Use importFullState assignment logic for each tile ---
        for (const data of wizardState.tileData) {
            if (!data) continue;
            const q = data.q + dq;
            const r = data.r + dr;
            const id = Object.keys(editor.hexes).find(k => {
                const h = editor.hexes[k];
                return h.q === q && h.r === r;
            });
            if (!id) continue;
            let hex = editor.hexes[id];
            const h = { ...data, id };

            // Skip if really empty/no content
            const noContent =
                (!h.realId && !h.realID) &&
                (!h.baseType || h.baseType === '') &&
                (!h.planets || h.planets.length === 0) &&
                (!h.effects || h.effects.length === 0) &&
                (!h.wormholes || h.wormholes.length === 0) &&
                (!h.links || isMatrixEmpty(h.links)) &&
                !h.customAdjacents && !h.adjacencyOverrides && !h.borderAnomalies;
            if (noContent) continue;

            // Clean overlays/effects/wormholes
            hex.overlays?.forEach(o => { if (o.parentNode) o.parentNode.removeChild(o); });
            hex.overlays = [];
            hex.wormholeOverlays?.forEach(o => { if (o.parentNode) o.parentNode.removeChild(o); });
            hex.wormholeOverlays = [];
            hex.effects = new Set();

            // ---- System lookup: Get system info for inherent wormholes, etc
            let code = "-1";
            let info = {};
            let realId = h.realId ?? h.realID;
            let realIdKey = realId ? realId.toString().toUpperCase() : null;
            if (realIdKey && editor.sectorIDLookup && editor.sectorIDLookup[realIdKey]) {
                code = realId.toString().toUpperCase();
                info = editor.sectorIDLookup[code] || {};
            } else if (h.baseType) {
                code = h.baseType;
                info = {};
            }

            // --------- Hyperlane tile logic ---------
            console.debug('PASTE DEBUG: hyperlane candidate', { id, h, info, matrix: h.matrix, links: h.links });
            const matrixToUse = (h.links && !isMatrixEmpty(h.links)) ? h.links
                : (h.matrix && !isMatrixEmpty(h.matrix)) ? h.matrix
                    : null;
            if (info.isHyperlane) {
                // Always mark as used and assign realId
                hex.realId = info.id ?? realId;
                if (hex.realId) markRealIDUsed(hex.realId);

                // Use matrix from copy (links or matrix), or from hyperlaneMatrices
                if (matrixToUse) {
                    hex.matrix = matrixToUse;
                    hex.links = matrixToUse;
                    console.debug('PASTE DEBUG: setting matrix', { id, matrix: matrixToUse });
                    drawMatrixLinks(editor, id, hex.matrix);
                } else if (editor.hyperlaneMatrices && info.id && editor.hyperlaneMatrices[info.id.toLowerCase()]) {
                    const matrix = editor.hyperlaneMatrices[info.id.toLowerCase()];
                    hex.matrix = matrix.map(row => [...row]); // deep copy
                    hex.links = hex.matrix;
                    console.debug('PASTE DEBUG: using default matrix', { id, matrix });
                    drawMatrixLinks(editor, id, hex.matrix);
                } else {
                    console.debug('PASTE DEBUG: no matrix found for hyperlane', { id, h });
                }
                // Do NOT assign baseType, overlays, planets, etc
                continue;
            }
            // --------- End hyperlane tile logic ---------

            // Attach realId and planets (for normal tiles)
            hex.realId = info.id ?? (h.realId ?? null);
            if (hex.realId) markRealIDUsed(hex.realId);
            hex.planets = info.planets || h.planets || [];

            // ---- Matrix/links (for non-hyperlane tiles)
            hex.matrix = h.links || Array.from({ length: 6 }, () => Array(6).fill(0));
            drawMatrixLinks(editor, id, hex.matrix);

            // ---- Adjacency/custom links/border anomalies
            if (h.customAdjacents !== undefined) hex.customAdjacents = JSON.parse(JSON.stringify(h.customAdjacents));
            else delete hex.customAdjacents;
            if (h.adjacencyOverrides !== undefined) hex.adjacencyOverrides = JSON.parse(JSON.stringify(h.adjacencyOverrides));
            else delete hex.adjacencyOverrides;
            if (h.borderAnomalies !== undefined) hex.borderAnomalies = JSON.parse(JSON.stringify(h.borderAnomalies));
            else delete hex.borderAnomalies;

            // ---- WORMHOLES: Use new pattern with proper cleanup and restoration ----
            // First, clear any existing wormhole overlays
            removeWormholeOverlay(editor, id);
            
            // Initialize wormhole sets
            hex.inherentWormholes = new Set();
            hex.customWormholes = new Set();
            hex.wormholes = new Set();
            
            if (h.type === 'realID' && info && info.wormholes) {
                // For realID tiles, inherent wormholes come from system info
                hex.inherentWormholes = new Set((info.wormholes || []).filter(Boolean).map(w => w.toLowerCase()));
            }
            
            // Custom wormholes come from the copied data
            if (h.customWormholes) {
                hex.customWormholes = new Set(Array.from(h.customWormholes).filter(Boolean).map(w => w.toLowerCase()));
            }
            
            // Update the union and create overlays
            updateHexWormholes(hex);
            
            // Create wormhole overlays for all wormholes (inherent + custom)
            if (hex.wormholes && hex.wormholes.size > 0) {
                Array.from(hex.wormholes).forEach((w, i) => {
                    const positions = editor.effectIconPositions;
                    const len = positions.length;
                    const reversedIndex = len - 1 - (i % len);
                    const pos = positions[reversedIndex] || { dx: 0, dy: 0 };
                    
                    import('../features/baseOverlays.js').then(({ createWormholeOverlay }) => {
                        const overlay = createWormholeOverlay(hex.center.x + pos.dx, hex.center.y + pos.dy, w.toLowerCase());
                        if (overlay) {
                            overlay.setAttribute('data-label', id);
                            const wormholeIconLayer = editor.svg.querySelector('#wormholeIconLayer');
                            if (wormholeIconLayer) {
                                wormholeIconLayer.appendChild(overlay);
                            } else {
                                editor.svg.appendChild(overlay);
                            }
                            if (!hex.wormholeOverlays) hex.wormholeOverlays = [];
                            hex.wormholeOverlays.push(overlay);
                        }
                    }).catch(err => {
                        console.warn('Could not create wormhole overlay:', err);
                    });
                });
            }

            // ---- Effects from JSON (always restore)
            (h.effects || []).forEach(eff => eff && editor.applyEffect(id, eff));

            // ---- USE THE SAME CLASSIFICATION LOGIC AS importSectorTypes ---
            if ((code === '-1' || h.baseType === "void") && isMatrixEmpty(h.links)) {
                editor.setSectorType(id, 'void');
                continue;
            }
            if (code === 'HL' || !isMatrixEmpty(h.links)) continue;
            if ((info.planets || []).some(p => p.planetType === 'FACTION') || h.baseType === "homesystem") {
                editor.setSectorType(id, 'homesystem');
                continue;
            }
            const noPlanets = !(info.planets || []).length;
            const special = info.isAsteroidField || info.isSupernova || info.isNebula || info.isGravityRift;
            if (noPlanets && special || h.baseType === "special") {
                editor.setSectorType(id, 'special');
            } else if ((info.planets || []).some(p => p.legendaryAbilityName?.trim()) || h.baseType === "legendary planet") {
                editor.setSectorType(id, 'legendary planet');
            } else {
                const count = (info.planets || []).length;
                if (count >= 3 || h.baseType === "3 planet") editor.setSectorType(id, '3 planet');
                else if (count >= 2 || h.baseType === "2 planet") editor.setSectorType(id, '2 planet');
                else if (count >= 1 || h.baseType === "1 planet") editor.setSectorType(id, '1 planet');
                else editor.setSectorType(id, 'empty');
            }

            // Effects from SystemInfo
            if (info.isNebula) editor.applyEffect(id, 'nebula');
            if (info.isGravityRift) editor.applyEffect(id, 'rift');
            if (info.isSupernova) editor.applyEffect(id, 'supernova');
            if (info.isAsteroidField) editor.applyEffect(id, 'asteroid');
        }
        editor.commitUndoGroup?.();
        clearPasteGhost(editor);

        // Update all visual overlays and layers
        updateEffectsVisibility(editor);
        updateWormholeVisibility(editor);
        updateTileImageLayer(editor);
        enforceSvgLayerOrder(editor.svg);
        redrawAllRealIDOverlays(editor);

        // ---- CUT FUNCTIONALITY: Clear original tiles if this was a cut operation ----
        if (wizardState.cut) {
            console.log('Cut operation: clearing original tiles', wizardState.selectedLabels);
            for (const label of wizardState.selectedLabels) {
                if (editor.hexes[label]) {
                    // Explicitly clear wormhole overlays first to ensure proper cleanup
                    removeWormholeOverlay(editor, label);
                    // Then clear everything else
                    editor.clearAll(label);
                }
            }
            // After cut, release paste mode and overlays, but do NOT close the main wizard popup
            wizardState.mode = null;
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
            // Do NOT hideWizardPopup();
            // Always close info/warning popup after cut
            if (typeof hideWizardInfoPopup === 'function') hideWizardInfoPopup();
        }

        // For copy, do NOT close or release anything (keep paste mode active)
        // But always close info/warning popup after copy
        if (!wizardState.cut && typeof hideWizardInfoPopup === 'function') hideWizardInfoPopup();
        // closeWizard(editor); // <-- Still commented out
        // Redraw overlays and enforce layer order
        if (typeof redrawAllRealIDOverlays === 'function') redrawAllRealIDOverlays(editor);
        if (typeof drawCustomAdjacencyLayer === 'function') drawCustomAdjacencyLayer(editor);
        if (typeof drawBorderAnomaliesLayer === 'function') drawBorderAnomaliesLayer(editor);
        if (typeof updateEffectsVisibility === 'function') updateEffectsVisibility(editor);
        if (typeof updateWormholeVisibility === 'function') updateWormholeVisibility(editor);
        if (typeof updateTileImageLayer === 'function') updateTileImageLayer(editor);
        if (typeof redrawBorderAnomaliesOverlay === 'function') redrawBorderAnomaliesOverlay(editor);
        if (typeof enforceSvgLayerOrder === 'function') enforceSvgLayerOrder(editor.svg);
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
        wizardState.onPastePreview = null; // prevent accidental re-attachment
    }
    if (wizardState.onKeyUp) document.removeEventListener('keyup', wizardState.onKeyUp);
    if (wizardState.cancelHandler) {
        editor.svg.removeEventListener('contextmenu', wizardState.cancelHandler);
        document.body.removeEventListener('click', wizardState.cancelHandler);
    }
    if (wizardState.prevOnHexClick) editor._onHexClick = wizardState.prevOnHexClick;
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

function isEmptyHex(hex) {
    // A hex is empty if it has no system, planets, effects, wormholes, baseType, realId, or hyperlane links/matrix
    if (!hex) return true;
    const hasMatrix = hex.matrix && Array.isArray(hex.matrix) && hex.matrix.some(row => row.some(cell => cell));
    const hasLinks = hex.links && Array.isArray(hex.links) && hex.links.some(row => row.some(cell => cell));
    return !hex.system &&
        (!hex.planets || hex.planets.length === 0) &&
        (!hex.effects || (hex.effects.size !== undefined ? hex.effects.size === 0 : hex.effects.length === 0)) &&
        (!hex.wormholes || (hex.wormholes.size !== undefined ? hex.wormholes.size === 0 : hex.wormholes.length === 0)) &&
        (!hex.baseType || hex.baseType === '') &&
        (!hex.realId) &&
        !hasMatrix &&
        !hasLinks;
}

// --- Hyperlane RealID rotation helpers ---
function parseHyperlaneRealID(realId) {
    // Handles hl_0, hl_1, 83a, 83a60, 83a120, etc.
    if (!realId) return { base: '', rot: 0, style: null };
    // Only treat underscore style if it starts with hl_
    let underscoreMatch = realId.match(/^(hl_[a-zA-Z0-9]+)_([0-5])$/);
    if (underscoreMatch) {
        return { base: underscoreMatch[1], rot: parseInt(underscoreMatch[2], 10), style: 'underscore' };
    }
    // If it ends with N*60 (e.g. 83a60, 83a120), treat as angle style
    // Only match if base ends with a letter (not a hyphen or digit)
    let angleMatch = realId.match(/^([a-zA-Z0-9]+[a-zA-Z])([0-9]{2,3})$/);
    if (angleMatch) {
        let angle = parseInt(angleMatch[2], 10);
        let rot = Math.round((angle % 360) / 60);
        let base = angleMatch[1].replace(/-+$/, ''); // Remove any trailing hyphens
        return { base, rot, style: 'angle' };
    }
    // If it is just the base (e.g. 83a), treat as angle style, rot 0
    let baseMatch = realId.match(/^([a-zA-Z0-9]+)$/);
    if (baseMatch) {
        return { base: baseMatch[1], rot: 0, style: 'angle' };
    }
    // fallback
    return { base: realId, rot: 0, style: null };
}

function buildHyperlaneRealID(base, rot, style, editor) {
    base = base.replace(/-+$/, ''); // Remove any trailing hyphens universally
    if (style === 'underscore' && base.startsWith('hl_')) {
        // Find the max variant for this base in sectorIDLookup or hyperlaneMatrices
        let max = 0;
        if (editor) {
            // Try sectorIDLookup first
            for (let i = 1; i <= 5; ++i) {
                let id = `${base}_${i}`;
                if (
                    (editor.sectorIDLookup && editor.sectorIDLookup[id.toUpperCase()]) ||
                    (editor.hyperlaneMatrices && editor.hyperlaneMatrices[id.toLowerCase()])
                ) {
                    max = i;
                }
            }
        } else {
            max = 5; // fallback
        }
        // Clamp/cycle rot
        let newRot = ((rot % (max + 1)) + (max + 1)) % (max + 1);
        return `${base}_${newRot}`;
    }
    if (style === 'angle') {
        // Always wrap rot to 0-5 (modulo 6)
        let wrappedRot = ((rot % 6) + 6) % 6;
        return wrappedRot === 0 ? `${base}` : `${base}${wrappedRot * 60}`;
    }
    return base;
}

// --- Expose logic/state for UI file ---
export { wizardState, parseHyperlaneRealID, buildHyperlaneRealID };

// --- Remove automatic UI setup on load to prevent premature popup display ---
// setupTileCopySingleButtonAndPopup();

// Listen for wizard-rotate events from the popup UI
window.addEventListener('wizard-rotate', (e) => {
    if (wizardState.mode === 'paste' && typeof rotateSelection === 'function') {
        rotateSelection(e.detail);
        clearPasteGhost(editor);
        if (typeof wizardState.onPastePreview === 'function' && wizardState.lastPastePreviewEvent) {
            wizardState.onPastePreview(wizardState.lastPastePreviewEvent);
        }
    }
});
