// @ts-check
/**
 * The tile engine behind copy, cut and paste: what a hex is, how a block of them rotates,
 * and how one is written back onto the map.
 *
 * This was three closures inside startCopyPasteWizard, reachable only by driving that
 * wizard's popup flow end to end. It is the part worth keeping — the interaction around it
 * is being replaced, and this is not. Nothing here knows about popups, modes, or the
 * selection; it takes hexes and data and returns data.
 *
 * MOVED, NOT REWRITTEN. The three bodies below are the wizard's own text, lifted verbatim.
 * The only edits are bindings: wizardState.origin became a parameter, wizardState.tileData
 * became a parameter, and the surrounding map()/function wrappers changed shape.
 * tools/test-clipboard-engine.js pins the behaviour, and the extraction script asserted
 * character-identity between the moved text and the original before this file was written.
 *
 * What deliberately stayed with the caller: beginUndoGroup/commitUndoGroup, clearing the
 * source on a cut, the overwrite confirmation, and the overlay redraw afterwards. Those are
 * decisions about one paste, not about what a tile is.
 */

import { isMatrixEmpty } from '../utils/matrix.js';
import { rotated } from '../modules/Hyperlanes/hyperlaneModel.js';
import { markRealIDUsed } from '../ui/uiFilters.js';
import { drawMatrixLinks } from './hyperlanes.js';
import { updateHexWormholes, removeWormholeOverlay } from './wormholes.js';
import { getBorderAnomalyTypes } from '../constants/borderAnomalies.js';
import { isScriptedAnomaly, isBidirectionalAnomaly } from '../distance/index.js';
import { buildCoordIndex, neighborHex, oppositeSide, normalizeSide } from '../utils/hexGrid.js';
import { redrawAllRealIDOverlays } from './realIDsOverlays.js';
import { redrawBorderAnomaliesOverlay } from './borderAnomaliesOverlay.js';
import { drawCustomAdjacencyLayer } from '../draw/customLinksDraw.js';
import { drawBorderAnomaliesLayer } from '../draw/borderAnomaliesDraw.js';
import { updateEffectsVisibility, updateWormholeVisibility, createWormholeOverlay } from './baseOverlays.js';
import { updateTileImageLayer } from './imageSystemsOverlay.js';
import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';

/** What a copy keeps. The wizard read these off window.tileCopyOptions. */
export const DEFAULT_COPY_OPTIONS = Object.freeze({
    wormholes: true, customAdjacents: true, borderAnomalies: true, tokens: true,
});

/**
 * Snapshot one hex into plain data.
 *
 * @param {any} editor
 * @param {string} label
 * @param {{wormholes?: boolean, customAdjacents?: boolean, borderAnomalies?: boolean, tokens?: boolean}} [opts]
 * @returns {any} the tile record, or null when the hex does not exist
 */
export function captureTile(editor, label, opts = DEFAULT_COPY_OPTIONS) {
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
            systemLore: hex.systemLore ? JSON.parse(JSON.stringify(hex.systemLore)) : undefined,
            planetLore: hex.planetLore ? JSON.parse(JSON.stringify(hex.planetLore)) : undefined,
            systemTokens: opts.tokens ? (hex.systemTokens ? [...hex.systemTokens] : []) : [],
            planetTokens: opts.tokens ? (hex.planetTokens ? JSON.parse(JSON.stringify(hex.planetTokens)) : {}) : {},
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
            systemLore: hex.systemLore ? JSON.parse(JSON.stringify(hex.systemLore)) : undefined,
            planetLore: hex.planetLore ? JSON.parse(JSON.stringify(hex.planetLore)) : undefined,
            systemTokens: opts.tokens ? (hex.systemTokens ? [...hex.systemTokens] : []) : [],
            planetTokens: opts.tokens ? (hex.planetTokens ? JSON.parse(JSON.stringify(hex.planetTokens)) : {}) : {},
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
            systemLore: hex.systemLore ? JSON.parse(JSON.stringify(hex.systemLore)) : undefined,
            planetLore: hex.planetLore ? JSON.parse(JSON.stringify(hex.planetLore)) : undefined,
            systemTokens: opts.tokens ? (hex.systemTokens ? [...hex.systemTokens] : []) : [],
            planetTokens: opts.tokens ? (hex.planetTokens ? JSON.parse(JSON.stringify(hex.planetTokens)) : {}) : {},
            label,
            q: hex.q,
            r: hex.r
        };
    }
    // Fallback: check if hex has any content to copy (wormholes, border anomalies, etc.)
    const hasWormholes = (hex.customWormholes && hex.customWormholes.size > 0) || (hex.wormholes && hex.wormholes.size > 0);
    const hasBorderAnomalies = hex.borderAnomalies && (Array.isArray(hex.borderAnomalies) ? hex.borderAnomalies.some(x => x) : Object.keys(hex.borderAnomalies).length > 0);
    const hasCustomAdjacents = hex.customAdjacents && (Array.isArray(hex.customAdjacents) ? hex.customAdjacents.some(x => x) : Object.keys(hex.customAdjacents).length > 0);
    const hasAdjacencyOverrides = hex.adjacencyOverrides && (Array.isArray(hex.adjacencyOverrides) ? hex.adjacencyOverrides.some(x => x) : Object.keys(hex.adjacencyOverrides).length > 0);
    const hasEffects = hex.effects && hex.effects.size > 0;

    if (hasWormholes || hasBorderAnomalies || hasCustomAdjacents || hasAdjacencyOverrides || hasEffects) {
        // Has some content, so copy it
        return {
            type: 'content',
            customWormholes: opts.wormholes ? Array.from(hex.customWormholes || []) : [],
            wormholes: opts.wormholes ? Array.from(hex.wormholes || []) : [], // Include all wormholes for content tiles
            links: hex.matrix ? JSON.parse(JSON.stringify(hex.matrix)) : undefined,
            matrix: hex.matrix ? JSON.parse(JSON.stringify(hex.matrix)) : undefined,
            effects: hex.effects ? Array.from(hex.effects) : [],
            customAdjacents: opts.customAdjacents && hex.customAdjacents ? JSON.parse(JSON.stringify(hex.customAdjacents)) : undefined,
            adjacencyOverrides: hex.adjacencyOverrides ? JSON.parse(JSON.stringify(hex.adjacencyOverrides)) : undefined,
            borderAnomalies: opts.borderAnomalies && hex.borderAnomalies ? JSON.parse(JSON.stringify(hex.borderAnomalies)) : undefined,
            systemLore: hex.systemLore ? JSON.parse(JSON.stringify(hex.systemLore)) : undefined,
            planetLore: hex.planetLore ? JSON.parse(JSON.stringify(hex.planetLore)) : undefined,
            systemTokens: opts.tokens ? (hex.systemTokens ? [...hex.systemTokens] : []) : [],
            planetTokens: opts.tokens ? (hex.planetTokens ? JSON.parse(JSON.stringify(hex.planetTokens)) : {}) : {},
            label,
            q: hex.q,
            r: hex.r
        };
    }
    // Truly empty tile
    return {
        type: 'empty',
        label,
        q: hex.q,
        r: hex.r
    };
}

/**
 * Snapshot a set of hexes, in the order given.
 *
 * @param {any} editor
 * @param {string[]} labels
 * @param {object} [opts]
 * @returns {any[]} one record per label; nulls for hexes that are gone
 */
export function captureTiles(editor, labels, opts = DEFAULT_COPY_OPTIONS) {
    return labels.map(label => captureTile(editor, label, opts));
}

/**
 * Turn a block 60 degrees about `origin`, in place.
 *
 * Rotates the positions, the hyperlane matrices, and every piece of edge-indexed data that
 * travels with a tile — border anomalies, custom adjacents, adjacency overrides. A realID
 * that encodes its own rotation (the hyperlane tiles) has that designator rebuilt.
 *
 * @param {any} editor
 * @param {any[]} tiles
 * @param {{q: number, r: number}} origin
 * @param {1|-1} dir  +1 clockwise, -1 counterclockwise
 */
export function rotateTiles(editor, tiles, origin, dir) {
    // dir: +1 = 60° clockwise, -1 = 60° counterclockwise
    const center = origin;
    tiles.forEach(tile => {
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
                const parsed = parseHyperlaneRealID(tile.realId);
                if (parsed.style) {
                    let newRot = parsed.rot + dir;
                    let cleanBase = parsed.base.replace(/-+$/, '');
                    const rebuilt = buildHyperlaneRealID(cleanBase, newRot, parsed.style, editor);
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
    // `rotated` lives in hyperlaneModel.js and is checked against a frozen copy of
    // the implementation that used to sit here (tools/test-hyperlanes.js).
    if (tile.matrix) tile.matrix = rotated(tile.matrix, dir);
    if (tile.links) tile.links = rotated(tile.links, dir);
    if (tile.borderAnomalies) {
        if (Array.isArray(tile.borderAnomalies)) {
            tile.borderAnomalies = rotateArr(tile.borderAnomalies);
        } else {
            const rotated = {};
            for (const [sideStr, val] of Object.entries(tile.borderAnomalies)) {
                rotated[((parseInt(sideStr, 10) + dir + 6) % 6)] = val;
            }
            tile.borderAnomalies = rotated;
        }
    }
    if (tile.customAdjacents) tile.customAdjacents = rotateArr(tile.customAdjacents);
    if (tile.adjacencyOverrides) tile.adjacencyOverrides = rotateArr(tile.adjacencyOverrides);
}

/**
 * Write a captured block onto the map, offset by (dq, dr).
 *
 * The caller owns the undo group: every destination hex is saved individually here, so
 * wrapping the call in beginUndoGroup/commitUndoGroup makes one paste one undo step.
 *
 * @param {any} editor
 * @param {any[]} tiles
 * @param {number} dq
 * @param {number} dr
 */
export function applyTiles(editor, tiles, dq, dr) {
    // --- Use importFullState assignment logic for each tile ---
    for (const data of tiles) {
        if (!data) continue;
        const q = data.q + dq;
        const r = data.r + dr;
        const id = Object.keys(editor.hexes).find(k => {
            const h = editor.hexes[k];
            return h.q === q && h.r === r;
        });
        if (!id) continue;
        editor.saveState(id);
        let hex = editor.hexes[id];
        const h = { ...data, id };

        // Skip if really empty/no content
        const hasWormholes = (h.wormholes && ((Array.isArray(h.wormholes) && h.wormholes.length > 0) || (h.wormholes instanceof Set && h.wormholes.size > 0))) ||
            (h.customWormholes && ((Array.isArray(h.customWormholes) && h.customWormholes.length > 0) || (h.customWormholes instanceof Set && h.customWormholes.size > 0))) ||
            (h.inherentWormholes && ((Array.isArray(h.inherentWormholes) && h.inherentWormholes.length > 0) || (h.inherentWormholes instanceof Set && h.inherentWormholes.size > 0)));
        const hasBorderAnomalies = h.borderAnomalies && (Array.isArray(h.borderAnomalies) ? h.borderAnomalies.some(x => x) : Object.keys(h.borderAnomalies).length > 0);

        const noContent =
            (!h.realId && !h.realID) &&
            (!h.baseType || h.baseType === '') &&
            (!h.planets || h.planets.length === 0) &&
            (!h.effects || h.effects.length === 0) &&
            !hasWormholes &&
            (!h.links || isMatrixEmpty(h.links)) &&
            !h.customAdjacents && !h.adjacencyOverrides && !hasBorderAnomalies;
        if (noContent) {
            editor.deleteAllSegments(id);
            hex.matrix = Array.from({ length: 6 }, () => Array(6).fill(0));
            hex.links = hex.matrix;
            continue;
        }

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
        const matrixToUse = (h.links && !isMatrixEmpty(h.links)) ? h.links
            : (h.matrix && !isMatrixEmpty(h.matrix)) ? h.matrix
                : null;
        if (info.isHyperlane) {
            // Full destination reset: clear neighbor border anomaly mirrors, then wipe hex
            clearBorderAnomalyMirrors(editor, hex);
            editor.clearAll(id);
            hex.realId = info.id ?? realId;
            if (hex.realId) markRealIDUsed(hex.realId);

            if (matrixToUse) {
                hex.matrix = matrixToUse;
                hex.links = matrixToUse;
                drawMatrixLinks(editor, id, hex.matrix);
            } else if (editor.hyperlaneMatrices && info.id && editor.hyperlaneMatrices[info.id.toLowerCase()]) {
                const matrix = editor.hyperlaneMatrices[info.id.toLowerCase()];
                hex.matrix = matrix.map(row => [...row]);
                hex.links = hex.matrix;
                drawMatrixLinks(editor, id, hex.matrix);
            }
            continue;
        }
        // --------- End hyperlane tile logic ---------

        // Attach realId and planets (for normal tiles)
        hex.realId = info.id ?? (h.realId ?? null);
        if (hex.realId) markRealIDUsed(hex.realId);
        hex.planets = info.planets || h.planets || [];

        // ---- Matrix/links (for non-hyperlane tiles)
        // deleteAllSegments must come first — it zeroes hex.matrix in-place,
        // so assigning h.links before the call would destroy the source matrix.
        editor.deleteAllSegments(id);
        hex.matrix = h.links || Array.from({ length: 6 }, () => Array(6).fill(0));
        hex.links = hex.matrix;
        drawMatrixLinks(editor, id, hex.matrix);

        // ---- Adjacency/custom links/border anomalies
        if (h.customAdjacents !== undefined) hex.customAdjacents = JSON.parse(JSON.stringify(h.customAdjacents));
        else delete hex.customAdjacents;
        if (h.adjacencyOverrides !== undefined) hex.adjacencyOverrides = JSON.parse(JSON.stringify(h.adjacencyOverrides));
        else delete hex.adjacencyOverrides;
        // Clear existing bidirectional mirrors from neighbors before overwriting
        clearBorderAnomalyMirrors(editor, hex);
        if (h.borderAnomalies !== undefined) hex.borderAnomalies = JSON.parse(JSON.stringify(h.borderAnomalies));
        else delete hex.borderAnomalies;
        // Apply new bidirectional mirrors to neighbors
        applyBorderAnomalyMirrors(editor, hex);

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
            });
        }

        // ---- Effects from JSON (always restore)
        (h.effects || []).forEach(eff => eff && editor.applyEffect(id, eff));

        // ---- USE THE SAME CLASSIFICATION LOGIC AS importSectorTypes ---
        // Only set to void if explicitly marked as void in the data
        if (h.baseType === "void" && isMatrixEmpty(h.links)) {
            editor.setSectorType(id, 'void');
            continue;
        }
        // Skip classification if no system info and no explicit baseType.
        // If source has hyperlane links, reset destination background to blank so it looks like a hyperlane hex.
        if (code === '-1' && !h.baseType) {
            if (h.links && !isMatrixEmpty(h.links)) editor.setSectorType(id, '');
            continue;
        }

        if (code === 'HL' || !isMatrixEmpty(h.links)) continue;
        if ((info.planets || []).some(p => p.planetType === 'FACTION') || h.baseType === "homesystem") {
            editor.setSectorType(id, 'homesystem');
            continue;
        }
        const noPlanets = !(info.planets || []).length;
        const special = info.isAsteroidField || info.isSupernova || info.isNebula || info.isGravityRift || info.isScar;
        if (noPlanets && special || h.baseType === "special") {
            editor.setSectorType(id, 'special');
        } else if ((info.planets || []).some(p => p.legendaryAbilityName?.trim()) || h.baseType === "legendary planet") {
            editor.setSectorType(id, 'legendary planet');
        } else {
            const count = (info.planets || []).length;
            const hasWormholes = hex.wormholes && hex.wormholes.size > 0;
            const hasBorderAnomalies = hex.borderAnomalies && Object.values(hex.borderAnomalies).some(x => x && x.type);

            if (count >= 3 || h.baseType === "3 planet") editor.setSectorType(id, '3 planet');
            else if (count >= 2 || h.baseType === "2 planet") editor.setSectorType(id, '2 planet');
            else if (count >= 1 || h.baseType === "1 planet") editor.setSectorType(id, '1 planet');
            else if (hasWormholes || hasBorderAnomalies) editor.setSectorType(id, 'empty');
            else editor.setSectorType(id, 'empty');
        }

        // Effects from SystemInfo
        if (info.isNebula)        editor.applyEffect(id, 'nebula');
        if (info.isGravityRift)   editor.applyEffect(id, 'rift');
        if (info.isSupernova)     editor.applyEffect(id, 'supernova');
        if (info.isAsteroidField) editor.applyEffect(id, 'asteroid');
        if (info.isScar)          editor.applyEffect(id, 'scar');

        // ---- LORE DATA: Restore system and planet lore ----
        if (h.systemLore !== undefined) {
            hex.systemLore = JSON.parse(JSON.stringify(h.systemLore));
        }
        if (h.planetLore !== undefined) {
            hex.planetLore = JSON.parse(JSON.stringify(h.planetLore));
        }

        // ---- TOKENS: Restore system and planet tokens ----
        hex.systemTokens = h.systemTokens ? [...h.systemTokens] : [];
        hex.planetTokens = h.planetTokens ? JSON.parse(JSON.stringify(h.planetTokens)) : {};
    }
}

/**
 * Put every overlay back after a paste.
 *
 * NEW, not moved: the wizard ran this list inline at the end of its paste handler. It is
 * the same list in the same order, pulled out so every caller redraws the same way — a
 * paste that updates the tiles but not the wormhole icons looks like a paste that half
 * worked.
 *
 * @param {any} editor
 */
export function refreshAfterPaste(editor) {
    redrawAllRealIDOverlays(editor);
    drawCustomAdjacencyLayer(editor);
    drawBorderAnomaliesLayer(editor);
    redrawBorderAnomaliesOverlay(editor);
    updateEffectsVisibility(editor);
    updateWormholeVisibility(editor);
    updateTileImageLayer(editor);
    editor.tokenOverlay?.refresh?.();
    enforceSvgLayerOrder(editor.svg);
    if (editor.loreOverlay?.isActive) editor.loreOverlay.refresh();
}

/**
 * Clear a set of hexes — the other half of a cut.
 *
 * NEW, not moved, but the same three calls the wizard made in its cut branch. The caller
 * owns the undo group.
 *
 * @param {any} editor
 * @param {string[]} labels
 */
export function clearTiles(editor, labels) {
    for (const label of labels) {
        if (!editor.hexes[label]) continue;
        editor.saveState(label);
        removeWormholeOverlay(editor, label);
        editor.clearAll(label);
    }
}

/**
 * The hexes a block would land on. Used to preview a paste and to ask about overwriting
 * before doing one.
 *
 * @param {any} editor
 * @param {any[]} tiles
 * @param {number} dq
 * @param {number} dr
 * @returns {string[]}
 */
export function pasteTargets(editor, tiles, dq, dr) {
    const out = [];
    for (const data of tiles) {
        if (!data) continue;
        const q = data.q + dq;
        const r = data.r + dr;
        const id = Object.keys(editor.hexes).find(k => {
            const h = editor.hexes[k];
            return h.q === q && h.r === r;
        });
        if (id) out.push(id);
    }
    return out;
}

/**
 * Only bidirectional border types live on both hexes of an edge, so only those
 * have a mirror to move with the tile.
 *
 * This used to match on the display names "Spatial Tear"/"Gravity Wave", which
 * missed every map storing the ID form ("SPATIALTEAR") — and it mirrored Gravity
 * Wave, which is one-way and is stored on the primary hex only, so copying a
 * tile turned a one-way border into a wall.
 */
function hasMirror(anomaly) {
    const types = getBorderAnomalyTypes();
    return isScriptedAnomaly(anomaly?.type) && isBidirectionalAnomaly(anomaly?.type, types);
}

/** Walk the mirrored border anomalies of `hex`, handing each neighbour + facing side to `fn`. */
function forEachMirroredNeighbor(editor, hex, fn) {
    if (!hex || !hex.borderAnomalies) return;
    const coordIndex = buildCoordIndex(editor.hexes);
    for (const [sideStr, anomaly] of Object.entries(hex.borderAnomalies)) {
        if (!hasMirror(anomaly)) continue;
        const side = normalizeSide(sideStr);
        const neighbor = neighborHex(editor.hexes, coordIndex, hex, side);
        if (!neighbor) continue;
        fn(neighbor, oppositeSide(side), anomaly);
    }
}

export function clearBorderAnomalyMirrors(editor, hex) {
    forEachMirroredNeighbor(editor, hex, (neighbor, opp) => {
        if (!neighbor.borderAnomalies) return;
        delete neighbor.borderAnomalies[opp];
        if (Object.keys(neighbor.borderAnomalies).length === 0) delete neighbor.borderAnomalies;
    });
}

export function applyBorderAnomalyMirrors(editor, hex) {
    forEachMirroredNeighbor(editor, hex, (neighbor, opp, anomaly) => {
        if (!neighbor.borderAnomalies) neighbor.borderAnomalies = {};
        neighbor.borderAnomalies[opp] = { type: anomaly.type };
    });
}

export function isEmptyHex(hex) {
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
export function parseHyperlaneRealID(realId) {
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

export function buildHyperlaneRealID(base, rot, style, editor) {
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