// @ts-check
/**
 * Galaxies on the map: adding, resizing and removing the extra boards a–g, drawing them
 * beside the main map, naming them, and framing one in the view.
 *
 * Every board lives in editor.hexes like the main map, so every tool, overlay, undo and
 * export works on it without knowing it is there. Its hexes carry `board` ('a'–'g') and
 * labels with the board letter in front (`a101`). Their q,r are shifted far along q (see
 * hexGrid.js), so no two boards ever share a coordinate; where they are DRAWN is decided
 * here, left to right after the main map as the bot lays them out.
 *
 * Changing the main map's size, or a board's, moves the boards to its right. Every
 * overlay is drawn at the hex centres, so moving them means redrawing all of it, which
 * relayoutGalaxies does. Board changes are not undoable, any more than ring changes are.
 *
 * State on the editor:
 *   editor.boards       { a: {rings}, ... }   the extra boards that exist
 *   editor.galaxyNames  { main: 'x', a: 'y' } the names chosen; unnamed is left to the bot
 */

import { GALAXY_BOARDS, MAX_BOARD_RINGS, boardQOffset, ringOfLabel } from '../utils/hexGrid.js';
import { hexPoints } from '../utils/hexGeometry.js';
import { drawHex, generateRings, autoscaleView } from '../draw/drawHexes.js';
import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';
import { drawCustomAdjacencyLayer } from '../draw/customLinksDraw.js';
import { drawBorderAnomaliesLayer } from '../draw/borderAnomaliesDraw.js';
import { renderHex } from '../modules/Hyperlanes/hyperlaneRender.js';
import { refreshEffectsOverlays } from './effects.js';
import { redrawWormholeOverlays } from './wormholes.js';
import { updateEffectsVisibility, updateWormholeVisibility, clearDistanceOverlays } from './baseOverlays.js';
import { redrawAllRealIDOverlays } from './realIDsOverlays.js';
import { updateTileImageLayer } from './imageSystemsOverlay.js';
import { refreshHexSelection } from './hexSelection.js';
import { drawMapSectorLayer } from './mapSectorOverlay.js';
import { announceMapReshaped } from './session.js';
import { applyViewBox } from '../ui/viewControls.js';
import { boardOriginsX, galaxyId, nextFreeBoard } from './galaxyModel.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const GALAXY_TITLE_LAYER_ID = 'galaxyTitleLayer';

/** Fired on `document` after galaxies are added, removed, resized or renamed. */
export const GALAXIES_CHANGED = 'ti4:galaxies-changed';

/** The y of every board's centre: the main grid's (drawHexes.hexToPixel). */
const ORIGIN_Y = 500;

/** @param {any} editor @returns {Record<string, {rings: number}>} */
export function boardsOf(editor) {
    if (!editor.boards) editor.boards = {};
    return editor.boards;
}

/** Rings per board, for the pure helpers. @param {any} editor */
export function boardRingCounts(editor) {
    /** @type {Record<string, number>} */
    const out = {};
    for (const [b, { rings }] of Object.entries(boardsOf(editor))) out[b] = rings;
    return out;
}

/** @param {any} editor @param {string} board */
export function hexesOnBoard(editor, board) {
    return Object.values(editor.hexes).filter(h => (h.board || '') === board && !h.isCorner);
}

// ── Layout ───────────────────────────────────────────────────────────────────

/** x of the main map's right edge, corners included. @param {any} editor */
function mainRightEdge(editor) {
    const R = editor.hexRadius || 40;
    let right = -Infinity;
    for (const h of Object.values(editor.hexes)) {
        if (h.board || !h.center) continue;
        right = Math.max(right, h.center.x);
    }
    return (Number.isFinite(right) ? right : 500) + R;
}

/**
 * Where a board hex is drawn, given its board's centre x.
 * @param {any} editor @param {{q: number, r: number}} hex @param {string} board @param {number} originX
 */
function boardHexCenter(editor, hex, board, originX) {
    const R = editor.hexRadius || 40;
    const lq = hex.q - boardQOffset(board);
    return {
        x: R * 1.5 * lq + originX,
        y: R * editor.sqrt3 * (hex.r + lq / 2) + ORIGIN_Y,
    };
}

/**
 * Put every board where it belongs, and redraw what sits on the hexes that moved.
 * Call after anything that changes a board's width or the main map's.
 *
 * @param {any} editor
 * @param {{fit?: boolean}} [opts]  fit the view to the whole map afterwards
 */
export function relayoutGalaxies(editor, { fit = false } = {}) {
    const R = editor.hexRadius || 40;
    const origins = boardOriginsX(boardRingCounts(editor), mainRightEdge(editor), R);

    const moved = [];
    for (const hex of Object.values(editor.hexes)) {
        const board = hex.board;
        if (!board || origins[board] === undefined) continue;
        const c = boardHexCenter(editor, hex, board, origins[board]);
        if (hex.center && Math.abs(hex.center.x - c.x) < 0.01 && Math.abs(hex.center.y - c.y) < 0.01) continue;
        hex.center = c;
        hex.polygon?.setAttribute('points', hexPoints(c, R));
        const txt = editor.svg?.querySelector(`#label-${hex.label}`);
        txt?.setAttribute('x', String(c.x));
        txt?.setAttribute('y', String(c.y + 5));
        moved.push(hex.label);
    }

    if (moved.length) redrawOverlays(editor, moved);
    drawGalaxyTitles(editor);
    enforceSvgLayerOrder(editor.svg);
    if (fit) autoscaleView(editor);
}

/**
 * Everything drawn at a hex centre, redrawn after `labels` moved. The per-hex pieces are
 * the overlays each hex owns; the rest are whole layers, rebuilt once.
 * @param {any} editor @param {string[]} labels
 */
function redrawOverlays(editor, labels) {
    for (const label of labels) {
        if (editor.hexes[label]?.overlays?.length) refreshEffectsOverlays(editor, label);
        redrawWormholeOverlays(editor, label);
        renderHex(editor, label);
    }
    redrawAllRealIDOverlays(editor);
    updateTileImageLayer(editor);
    drawCustomAdjacencyLayer(editor);
    drawBorderAnomaliesLayer(editor);
    editor.tokenOverlay?.refresh();
    editor.loreOverlay?.refresh();
    drawMapSectorLayer(editor);
    refreshHexSelection(editor);
    // Lines drawn between hexes that are now somewhere else: cleared rather than left
    // pointing at empty space. Both come back with their own buttons.
    editor.clearWormholeLinks?.();
    clearDistanceOverlays(editor);
    import('./valueOverlay.js').then(({ drawValueTargetLayer, drawValueOverlay, isValueOverlayActive }) => {
        drawValueTargetLayer(editor);
        if (isValueOverlayActive(editor)) drawValueOverlay(editor, false, false, false);
    }).catch(() => {});
    updateEffectsVisibility(editor);
    updateWormholeVisibility(editor);
}

/**
 * Each galaxy's name above it, once there is more than one: "a · frontier". Unnamed
 * galaxies show what the bot will call them.
 * @param {any} editor
 */
export function drawGalaxyTitles(editor) {
    editor.svg?.querySelector('#' + GALAXY_TITLE_LAYER_ID)?.remove();
    const boards = Object.keys(boardsOf(editor));
    if (!boards.length || !editor.svg) return;

    const R = editor.hexRadius || 40;
    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = GALAXY_TITLE_LAYER_ID;
    layer.style.pointerEvents = 'none';

    for (const board of ['', ...GALAXY_BOARDS]) {
        if (board && !boards.includes(board)) continue;
        const hexes = hexesOnBoard(editor, board).filter(h => h.center);
        if (!hexes.length) continue;
        const xs = hexes.map(h => h.center.x);
        const top = Math.min(...hexes.map(h => h.center.y));
        const id = galaxyId(board);
        const name = editor.galaxyNames?.[id];
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', String((Math.min(...xs) + Math.max(...xs)) / 2));
        text.setAttribute('y', String(top - R * 1.6));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('class', 'galaxy-title');
        text.setAttribute('font-size', String(Math.round(R * 0.7)));
        text.setAttribute('font-weight', 'bold');
        text.textContent = name ? `${id} · ${name}` : `${id} · (named by the bot)`;
        layer.appendChild(text);
    }
    editor.svg.appendChild(layer);
}

// ── Adding, resizing, removing ───────────────────────────────────────────────

/**
 * Draw the hexes of `board` out to `rings` that are not there yet. No layout: they are
 * placed at a provisional origin and relayoutGalaxies puts them where they belong.
 * @param {any} editor @param {string} board @param {number} rings
 */
function drawBoardHexes(editor, board, rings) {
    const offset = boardQOffset(board);
    for (const { q, r, label } of generateRings(rings, false)) {
        const full = board + label;
        if (editor.hexes[full]) continue;
        const hex = { q: q + offset, r };
        drawHex(editor, hex.q, r, full, boardHexCenter(editor, hex, board, 0));
        const h = editor.hexes[full];
        h.board = board;
        h.planets = [];
        h.realId = null;
    }
}

/**
 * Delete the hexes of `board` beyond `rings` (all of them at -1), with whatever they hold.
 * Links from other hexes into them go too, rather than pointing at nothing.
 * @param {any} editor @param {string} board @param {number} rings
 */
function cutBoardHexes(editor, board, rings) {
    const cut = hexesOnBoard(editor, board).filter(h => (ringOfLabel(h.label) ?? 0) > rings);
    if (!cut.length) return;
    const gone = new Set(cut.map(h => h.label));
    editor._historyLocked = true;
    try {
        for (const hex of cut) {
            editor.clearAll(hex.label);
            editor.clearCustomAdjacenciesBothSides?.(hex.label);
            hex.polygon?.remove();
            editor.svg?.querySelector(`#label-${hex.label}`)?.remove();
            delete editor.hexes[hex.label];
        }
        for (const other of Object.values(editor.hexes)) {
            for (const target of Object.keys(other.customAdjacents || {})) {
                if (gone.has(target)) delete other.customAdjacents[target];
            }
            for (const [side, target] of Object.entries(other.adjacencyOverrides || {})) {
                if (gone.has(String(target))) delete other.adjacencyOverrides[side];
            }
        }
    } finally {
        editor._historyLocked = false;
    }
}

/**
 * Tell the panel, and the session autosave, that the galaxies changed. Board changes are
 * not undoable, so nothing goes on the undo stack.
 */
function announce() {
    if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent(GALAXIES_CHANGED));
    announceMapReshaped();
}

/**
 * Add a galaxy: the next free board letter, `rings` rings.
 * @param {any} editor @param {number} [rings]
 * @returns {string|null} the board letter, or null with all seven in use
 */
export function addGalaxy(editor, rings = 3) {
    const boards = boardsOf(editor);
    const board = nextFreeBoard(boards);
    if (!board) return null;
    const n = Math.max(1, Math.min(MAX_BOARD_RINGS, rings));
    boards[board] = { rings: n };
    drawBoardHexes(editor, board, n);
    relayoutGalaxies(editor, { fit: true });
    announce();
    return board;
}

/**
 * Resize a galaxy. The caller asks before cutting hexes with content (hexesCutFromBoard).
 * @param {any} editor @param {string} board @param {number} rings
 */
export function setGalaxyRings(editor, board, rings) {
    const boards = boardsOf(editor);
    if (!boards[board]) return;
    const n = Math.max(1, Math.min(MAX_BOARD_RINGS, rings));
    if (n === boards[board].rings) return;
    if (n < boards[board].rings) cutBoardHexes(editor, board, n);
    else drawBoardHexes(editor, board, n);
    boards[board].rings = n;
    relayoutGalaxies(editor);
    drawMapSectorLayer(editor);
    announce();
}

/** The hexes a resize to `rings` would delete. @param {any} editor @param {string} board @param {number} rings */
export function hexesCutFromBoard(editor, board, rings) {
    return hexesOnBoard(editor, board).filter(h => (ringOfLabel(h.label) ?? 0) > rings);
}

/** Remove a galaxy and everything on it. @param {any} editor @param {string} board */
export function removeGalaxy(editor, board) {
    const boards = boardsOf(editor);
    if (!boards[board]) return;
    cutBoardHexes(editor, board, -1);
    delete boards[board];
    if (editor.galaxyNames) delete editor.galaxyNames[board];
    relayoutGalaxies(editor, { fit: true });
    drawMapSectorLayer(editor);
    announce();
}

/**
 * Name a galaxy, or clear its name with ''. The caller validates (galaxyNameProblem).
 * @param {any} editor @param {string} id  'main' or a board letter @param {string} name
 */
export function setGalaxyName(editor, id, name) {
    if (!editor.galaxyNames) editor.galaxyNames = {};
    if (name) editor.galaxyNames[id] = name;
    else delete editor.galaxyNames[id];
    drawGalaxyTitles(editor);
    enforceSvgLayerOrder(editor.svg);
    announce();
}

/**
 * Create the boards an import or a session restore found, sized as given, in one layout
 * pass. Call right after generateMap, before the hexes are filled in.
 *
 * @param {any} editor @param {Record<string, number>} rings
 * @returns {string[]} every label on those boards, for the importer's label list
 */
export function createGalaxies(editor, rings) {
    const boards = boardsOf(editor);
    const labels = [];
    for (const board of GALAXY_BOARDS) {
        const n = rings[board];
        if (!n) continue;
        boards[board] = { rings: n };
        drawBoardHexes(editor, board, n);
        for (const { label } of generateRings(n, false)) labels.push(board + label);
    }
    if (labels.length) relayoutGalaxies(editor, { fit: true });
    return labels;
}

// ── View ─────────────────────────────────────────────────────────────────────

/**
 * Frame one galaxy in the view: '' for the main map (corners included).
 * @param {any} editor @param {string} board
 */
export function focusGalaxy(editor, board) {
    const pts = Object.values(editor.hexes)
        .filter(h => (h.board || '') === board && h.center)
        .map(h => h.center);
    if (!pts.length) return;
    const R = editor.hexRadius || 40;
    const margin = R * 2;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs) - margin, maxX = Math.max(...xs) + margin;
    const minY = Math.min(...ys) - margin * 1.6, maxY = Math.max(...ys) + margin;
    applyViewBox(editor, [minX, minY, maxX - minX, maxY - minY]);
}
