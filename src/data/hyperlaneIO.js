// ───────────────────────────────────────────────────────────────
// data/hyperlaneIO.js
//
// How hyperlanes cross the boundary to and from the bot. Pure — no DOM, no editor — so
// tools/test-mapinfo.js can hold it to the bot's own test cases.
//
// Two forms of the same 6×6 matrix (row = side entered, column = side left):
//   - stored: 0/1, a lane set in one direction only is one-way. This is hex.matrix, the
//     bot's game state, its packed hyperlane Export/Import and lore `!sethyperlane`.
//   - typed:  1 two-way, 2 one-way. This is the JSON map's `customHyperlaneString`
//     (MapJsonIOService writes CustomHyperlaneService.toTypedMatrix, and reads it back
//     through insertData → toStoredMatrix, which mirrors every 1).
//
// The bot draws and connects custom lanes only on a tile whose id is `hl`
// (CustomHyperlaneService.getHyperlaneDataForTile). A static hyperlane tile (83a …)
// always uses its printed lanes, and a system tile has none.
// ───────────────────────────────────────────────────────────────

import {
    cloneMatrix, hasLinks, sameMatrix, symmetrised, toStoredMatrix, toTypedMatrix
} from '../modules/Hyperlanes/hyperlaneModel.js';
import { bridgeProblem, hasBridge, normalizedBridge } from '../modules/Hyperlanes/bridgeModel.js';
import {
    canHoldPortals, describePortals, encodeCompact, hasPortals, parseAnyPortals
} from '../modules/Hyperlanes/portalModel.js';

/** The tile id the bot reads custom lanes from. */
export const CUSTOM_HYPERLANE_TILE = 'hl';

/** A matrix as the bot writes it: `a,b,c,d,e,f;…`. */
export function formatMatrixString(matrix) {
    return matrix.map(row => row.join(',')).join(';');
}

/**
 * The JSON `customHyperlaneString` for a stored matrix: the typed form, or '' with no lanes.
 * @param {number[][]} matrix
 */
export function customHyperlaneString(matrix) {
    const stored = cloneMatrix(matrix);
    return hasLinks(stored) ? formatMatrixString(toTypedMatrix(stored)) : '';
}

/**
 * A typed matrix string as cells, or null when it is not one. Accepts exactly what
 * CustomHyperlaneService.isValidConnectionMatrix accepts: six rows of six cells, each 0, 1
 * or 2 once trimmed. Like Java's String.split, trailing empty rows and cells are dropped.
 *
 * @param {unknown} text
 * @returns {number[][]|null}
 */
export function parseTypedMatrixString(text) {
    if (typeof text !== 'string') return null;
    const rows = javaSplit(text, ';');
    if (rows.length !== 6) return null;
    const out = [];
    for (const row of rows) {
        const cells = javaSplit(row, ',').map(c => c.trim());
        if (cells.length !== 6 || !cells.every(c => c === '0' || c === '1' || c === '2')) return null;
        out.push(cells.map(Number));
    }
    return out;
}

function javaSplit(text, sep) {
    const parts = text.split(sep);
    while (parts.length && parts[parts.length - 1] === '') parts.pop();
    return parts;
}

/**
 * The stored matrix a JSON `customHyperlaneString` describes, as the bot would store it,
 * or null when the string is not a valid matrix.
 *
 * @param {unknown} text
 * @returns {number[][]|null}
 */
export function storedMatrixFromCustomString(text) {
    const typed = parseTypedMatrixString(text);
    return typed ? toStoredMatrix(typed) : null;
}

/**
 * What a hex's lanes become in a bot export.
 *
 *   - `tileID`: the id to export the tile as. A static hyperlane tile whose lanes were
 *     redrawn becomes `hl`, or the bot would draw its printed lanes and drop the new ones
 *     (one-way lanes are never printed on a static tile, so they always land here).
 *   - `lanes`: the stored matrix to write as custom lanes, or null when there is none to
 *     write (no lanes, or a static tile that still has exactly its printed lanes).
 *   - `ignoredByBot`: a system tile with lanes drawn on it. They are still written, so the
 *     editor gets them back, but the bot does not read lanes on a system tile.
 *
 * @param {{matrix?: number[][], realId?: string|null, systemId?: string|null}} hex
 * @param {Record<string, number[][]>} [staticMatrices]  editor.hyperlaneMatrices (lowercase keys)
 * @returns {{tileID: string, lanes: number[][]|null, ignoredByBot: boolean}}
 */
export function hyperlaneExportInfo(hex, staticMatrices = {}) {
    const id = String(hex?.realId || hex?.systemId || '');
    const lanes = hex?.matrix ? cloneMatrix(hex.matrix) : null;
    const portals = hasPortals(hex);
    if (!lanes || !hasLinks(lanes)) {
        // An empty tile with portals is an interchange: an `hl` with no lanes.
        if (portals && (!id || id.toLowerCase() === CUSTOM_HYPERLANE_TILE)) {
            return { tileID: CUSTOM_HYPERLANE_TILE, lanes: null, ignoredByBot: false };
        }
        return { tileID: id, lanes: null, ignoredByBot: false };
    }
    if (!id || id.toLowerCase() === CUSTOM_HYPERLANE_TILE) {
        return { tileID: CUSTOM_HYPERLANE_TILE, lanes, ignoredByBot: false };
    }
    const printed = staticMatrices?.[id.toLowerCase()];
    if (printed) {
        // The bot takes portals only on a custom `hl`, so a static tile carrying them goes
        // out as one, with its printed lanes.
        return sameMatrix(printed, lanes) && !portals
            ? { tileID: id, lanes: null, ignoredByBot: false }
            : { tileID: CUSTOM_HYPERLANE_TILE, lanes, ignoredByBot: false };
    }
    return { tileID: id, lanes, ignoredByBot: true };
}

// ── Bridges (`bridgeLanes` on a system tile) ──────────────────────────────────

/**
 * Whether a tile id is one the bot puts a bridge on: a system, not `hl` nor a printed
 * hyperlane tile (HyperlaneBridges.problemWith → isHyperlane).
 * @param {unknown} tileID
 * @param {Record<string, number[][]>} [staticMatrices]
 */
export function isBridgeHostTile(tileID, staticMatrices = {}) {
    const key = String(tileID || '').toLowerCase();
    return !!key && key !== CUSTOM_HYPERLANE_TILE && !staticMatrices?.[key];
}

/**
 * Why a hex can't carry a bridge at all, or null: it needs a system on it
 * (HyperlaneBridges.problemWith → tile exists, not a hyperlane). The one check the map, the
 * tile dialog and the export all share.
 * @param {{realId?: string|null, systemId?: string|null}} hex
 * @param {Record<string, number[][]>} [staticMatrices]
 */
export function bridgeHostProblem(hex, staticMatrices = {}) {
    const id = String(hex?.realId || hex?.systemId || '');
    if (!id) return 'Place a system on this tile first: a bridge runs through a system.';
    if (!isBridgeHostTile(id, staticMatrices)) return 'This is a hyperlane tile; bridges go on systems. Draw hyperlanes with the Hyperlanes tool.';
    return null;
}

/**
 * Why a hex can't carry portals at all, or null: a system can't (an empty hex becomes an
 * interchange `hl`, a printed hyperlane goes out as `hl`). Not being a roundabout is a
 * separate, softer problem — see canHoldPortals.
 * @param {{realId?: string|null, systemId?: string|null}} hex
 * @param {Record<string, number[][]>} [staticMatrices]
 */
export function portalHostProblem(hex, staticMatrices = {}) {
    const id = String(hex?.realId || hex?.systemId || '').toLowerCase();
    if (id && id !== CUSTOM_HYPERLANE_TILE && !staticMatrices?.[id]) {
        return 'This is a system tile; portals go on hyperlanes (a roundabout, or an empty tile as an interchange).';
    }
    return null;
}

/** The JSON `bridgeLanes` (typed form) of a stored bridge, or '' with no lanes. */
export function bridgeLanesString(bridge) {
    const stored = normalizedBridge(bridge);
    return stored ? formatMatrixString(toTypedMatrix(stored)) : '';
}

/**
 * Reads a JSON `bridgeLanes` the way the bot does: a typed matrix, diagonal 0, lanes that
 * fit on the rim. Returns the stored bridge, or the reason the bot would skip it.
 *
 * @param {unknown} text
 * @returns {{bridge: number[][]|null, problem: string|null}}
 */
export function bridgeFromLanesString(text) {
    const typed = parseTypedMatrixString(text);
    if (!typed) return { bridge: null, problem: 'The matrix needs 6 rows of 6 values (0, 1 or 2), rows separated by `;`.' };
    for (let s = 0; s < 6; s++) {
        if (typed[s][s] !== 0) {
            return { bridge: null, problem: "A bridge can't connect a side to itself (no roundabouts); keep the diagonal at 0." };
        }
    }
    const stored = toStoredMatrix(typed);
    const problem = bridgeProblem(stored);
    return problem ? { bridge: null, problem } : { bridge: normalizedBridge(stored), problem: null };
}

/**
 * What a hex's bridge becomes in a bot export: the `bridgeLanes` string to write, or the
 * reason the bot would refuse it (then nothing is written).
 *
 * @param {{bridge?: number[][]}} hex
 * @param {string} tileID  the id the hex exports as
 * @param {Record<string, number[][]>} [staticMatrices]
 * @returns {{text: string, problem: string|null}}
 */
export function bridgeExportInfo(hex, tileID, staticMatrices = {}) {
    if (!hasBridge(hex)) return { text: '', problem: null };
    if (!isBridgeHostTile(tileID, staticMatrices)) {
        return { text: '', problem: 'bridges go on system tiles' };
    }
    const problem = bridgeProblem(hex.bridge);
    return problem ? { text: '', problem } : { text: bridgeLanesString(hex.bridge), problem: null };
}

// ── Portals (`portals` on an `hl` tile) ───────────────────────────────────────

/**
 * Reads a JSON `portals` value (`0=A, 1=C<, 3=B>`, slotless `A, B>` or compact `0A1C<`).
 * @returns {{portals: Array<{slot: number, letter: string, flow: string}>|null, problem: string|null}}
 */
export function portalsFromString(text) {
    const { slots, problem } = parseAnyPortals(text);
    if (problem) return { portals: null, problem };
    return { portals: slots.length ? slots : null, problem: null };
}

/**
 * What a hex's portals become in a bot export, given its export info: the `portals` string
 * and the compact form for the text Export, or the reason the bot would refuse them.
 *
 * @param {{portals?: Array<{slot: number, letter: string, flow: string}>}} hex
 * @param {{tileID: string, lanes: number[][]|null}} info  hyperlaneExportInfo(hex)
 * @returns {{text: string, compact: string, problem: string|null}}
 */
export function portalsExportInfo(hex, info) {
    if (!hasPortals(hex)) return { text: '', compact: '', problem: null };
    if (info?.tileID !== CUSTOM_HYPERLANE_TILE) {
        return { text: '', compact: '', problem: 'portals go on custom hyperlanes (hl)' };
    }
    if (!canHoldPortals(info.lanes)) {
        return { text: '', compact: '', problem: "it isn't a roundabout (portals sit on a roundabout's ring, or on an empty hl)" };
    }
    return { text: describePortals(hex.portals), compact: encodeCompact(hex.portals), problem: null };
}

/**
 * The printed lanes of a static hyperlane tile id, as a fresh matrix, or null when the id
 * is not one. A JSON tile like `83a` carries no `customHyperlaneString` — the bot only
 * writes one for `hl` — so its lanes come from here.
 *
 * @param {unknown} tileID
 * @param {Record<string, number[][]>} [staticMatrices]
 */
export function staticHyperlaneMatrix(tileID, staticMatrices = {}) {
    const key = String(tileID || '').toLowerCase();
    const printed = key && staticMatrices?.[key];
    return printed ? cloneMatrix(printed) : null;
}

/**
 * Brings a full-state save's lanes up to date, in place. A save marked `hlDirected` was
 * written since one-way lanes exist and is read as it is. An older one could hold a lane
 * set in one direction that was meant two-way (from an older import or drawing code), so
 * its lanes are mirrored, as they were always read before.
 *
 * @param {{hlDirected?: boolean}} save
 * @param {Array<{ln?: number[][], links?: number[][]}>} hexes  the save's hex records
 */
export function upgradeLegacyLanes(save, hexes) {
    if (save?.hlDirected === true) return;
    for (const h of hexes || []) {
        if (Array.isArray(h.ln)) h.ln = symmetrised(h.ln);
        if (Array.isArray(h.links)) h.links = symmetrised(h.links);
    }
}
