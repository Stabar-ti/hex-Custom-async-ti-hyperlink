/**
 * The two tile dialogs behind the tile menu's Hyperlane ▸ Bridge… and Portals…:
 *
 *   - Bridge (a system tile): the lanes that run through the system along its rim. A row
 *     per lane — two sides and a direction — or the bot's typed matrix as text. The bot's
 *     rules are checked as you go (one lane per side, no crossings, room on the rim).
 *   - Portals (a roundabout or empty `hl` tile): seven slots, each a letter and a flow, or
 *     the bot's text form (`0=A, 3=B>, C<` or compact `0A3B>`).
 *
 * Each save is one undo step and redraws the hex (renderHex draws both).
 */

import { el, button } from './kit/index.js';
import { showPopup, hidePopup } from './popupUI.js';
import { showToast } from './uiToast.js';
import { hexPoints } from '../utils/hexGeometry.js';
import { matrixToHex, hexToMatrix } from '../utils/matrix.js';
import { drawPlan, emptyMatrix, toStoredMatrix } from '../modules/Hyperlanes/hyperlaneModel.js';
import { renderHex } from '../modules/Hyperlanes/hyperlaneRender.js';
import { drawBridge, drawPortals } from '../draw/bridgePortalDraw.js';
import { drawSegment, drawRoundabout } from '../draw/hyperlaneDraw.js';
import {
    SIDE_NAMES, bridgeFromLanes, bridgeProblem, isEmptyBridge, lanesOfBridge, normalizedBridge
} from '../modules/Hyperlanes/bridgeModel.js';
import {
    PORTAL_SLOTS, canHoldPortals, describePortals, encodeCompact, flowMarker, parseAnyPortals, portalColour
} from '../modules/Hyperlanes/portalModel.js';
import {
    bridgeHostProblem, bridgeLanesString, parseTypedMatrixString, portalHostProblem
} from '../data/hyperlaneIO.js';

const BRIDGE_POPUP = 'bridgeDialogPopup';
const PORTAL_POPUP = 'portalDialogPopup';

/** The rail's ⇶ Bridges / ◉ Portals tools: armed, a map click opens that tile's dialog. */
export const BRIDGE_PICK_MODE = 'bridge-pick';
export const PORTAL_PICK_MODE = 'portal-pick';

/** Whether `mode` is one of the two pick tools. */
export function isBridgePortalPickMode(mode) {
    return mode === BRIDGE_PICK_MODE || mode === PORTAL_PICK_MODE;
}

/**
 * A map click while a pick tool is armed: open the tile's dialog, or say why it can't
 * take one (a tile that already has one always opens, so it can be fixed or removed).
 * The tool stays armed, so several tiles can be done in a row.
 * @param {any} editor
 * @param {string} label
 * @param {string} mode
 */
export function pickTileForDialog(editor, label, mode) {
    const hex = editor.hexes[label];
    if (!hex) return;
    if (mode === BRIDGE_PICK_MODE) {
        const problem = bridgeTileProblem(editor, hex);
        if (problem && !hex.bridge) { showToast(`${label}: ${problem}`, 'warning', 4000); return; }
        openBridgeDialog(editor, label);
    } else if (mode === PORTAL_PICK_MODE) {
        const problem = portalTileProblem(editor, hex);
        if (problem && !hex.portals?.length) { showToast(`${label}: ${problem}`, 'warning', 4000); return; }
        openPortalsDialog(editor, label);
    }
}
const SVG_NS = 'http://www.w3.org/2000/svg';

// ── Shared bits ──────────────────────────────────────────────────────────────

function selectEl(options, value, onChange) {
    const node = el('select', { className: 'input-dark bp-select' });
    for (const [v, text] of options) {
        const o = el('option', { text });
        o.value = v;
        node.appendChild(o);
    }
    node.value = value;
    node.addEventListener('change', () => onChange(node.value));
    return node;
}

/** Stops the map's key shortcuts from firing while typing in a dialog. */
function guardKeys(input, onEnter) {
    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); }
    });
}

/** A small preview of one hex with its lanes, plus whatever `draw` adds. */
function previewSvg(matrix, draw) {
    const size = 132, R = 60;
    const center = { x: size / 2, y: size / 2 };
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.classList.add('bp-preview');
    const poly = document.createElementNS(SVG_NS, 'polygon');
    poly.setAttribute('points', hexPoints(center, R));
    poly.setAttribute('class', 'bp-preview-hex');
    svg.appendChild(poly);
    for (let s = 0; s < 6; s++) {
        const a = (s * 60) * Math.PI / 180;
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', String(center.x + (R * 0.98) * Math.sin(a)));
        t.setAttribute('y', String(center.y - (R * 0.98) * Math.cos(a)));
        t.setAttribute('class', 'bp-preview-side');
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'central');
        t.textContent = SIDE_NAMES[s];
        svg.appendChild(t);
    }
    const layer = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(layer);
    let hasRing = false;
    if (Array.isArray(matrix)) {
        const { roundabout, roles, curves } = drawPlan(matrix);
        for (const seg of curves) {
            drawSegment(layer, { center, entry: seg.entry, exit: seg.exit, radius: R, viaLabel: 'preview', oneWay: seg.oneWay });
        }
        if (roundabout.length) {
            hasRing = true;
            drawRoundabout(layer, { center, sides: roundabout, radius: R, viaLabel: 'preview', roles });
        }
    }
    draw(layer, center, R, hasRing);
    return svg;
}

function replacePreview(holder, node) {
    holder.replaceChildren(node);
}

// ── Bridge ───────────────────────────────────────────────────────────────────

/** Why this tile can't carry a bridge at all, or null. */
export function bridgeTileProblem(editor, hex) {
    return bridgeHostProblem(hex, editor.hyperlaneMatrices);
}

/**
 * Reads the bridge text box: the typed matrix (`0,0,0,2,0,0;…`) or the 9-hex stored form.
 * @returns {{matrix: number[][]|null, problem: string|null}}
 */
function parseBridgeText(text) {
    const t = text.trim();
    if (!t) return { matrix: emptyMatrix(), problem: null };
    const diagonal = "A bridge can't connect a side to itself; keep the diagonal at 0.";
    if (/^[0-9a-fA-F]{9}$/.test(t)) {
        const m = hexToMatrix(t);
        return m.some((row, s) => row[s] !== 0) ? { matrix: null, problem: diagonal } : { matrix: m, problem: null };
    }
    const typed = parseTypedMatrixString(t);
    if (!typed) return { matrix: null, problem: 'Six rows of six values (0, 1 or 2), rows separated by ";" — or the 9-hex form.' };
    for (let s = 0; s < 6; s++) if (typed[s][s] !== 0) return { matrix: null, problem: diagonal };
    return { matrix: toStoredMatrix(typed), problem: null };
}

/**
 * Opens the bridge editor for one tile.
 * @param {any} editor
 * @param {string} label
 */
export function openBridgeDialog(editor, label) {
    const hex = editor.hexes[label];
    if (!hex) return;
    const tileProblem = bridgeTileProblem(editor, hex);
    /** @type {Array<{a: number, b: number, dir: string}>} */
    let lanes = lanesOfBridge(hex.bridge || emptyMatrix());

    const sideOptions = SIDE_NAMES.map((n, i) => [String(i), `${i} ${n}`]);
    const dirOptions = [['both', '↔ two-way'], ['ab', '→ one-way'], ['ba', '← one-way']];

    const rowsBox = el('div', { className: 'bp-rows' });
    const text = /** @type {HTMLInputElement} */ (el('input', {
        className: 'input-dark bp-text', attrs: { spellcheck: 'false', autocomplete: 'off', placeholder: '0,0,0,2,0,0;0,0,1,0,0,0;…  or  108400000' }
    }));
    const hexLine = el('div', { className: 'bp-muted' });
    const problemLine = el('div', { className: 'bp-problem' });
    const previewBox = el('div', { className: 'bp-preview-box' });
    const save = button({ text: 'Save', variant: 'primary' });
    const remove = button({ text: 'Remove bridge' });
    const cancel = button({ text: 'Cancel' });
    let textProblem = null;

    const matrixNow = () => bridgeFromLanes(lanes);

    const refresh = ({ fromText = false } = {}) => {
        const m = matrixNow();
        if (!fromText) { text.value = bridgeLanesString(m); textProblem = null; }
        hexLine.textContent = isEmptyBridge(m) ? 'No lanes yet.' : `9-hex (text Export, lore !setbridge): ${matrixToHex(m)}`;
        const problem = tileProblem || textProblem || bridgeProblem(m);
        problemLine.textContent = problem || '';
        save.disabled = !!problem || (isEmptyBridge(m) && !hex.bridge);
        replacePreview(previewBox, previewSvg(null, (layer, center, R) => {
            if (!isEmptyBridge(m)) drawBridge(layer, { center, radius: R, viaLabel: 'preview', bridge: m, invalid: !!bridgeProblem(m) });
        }));
        renderRows();
    };

    const renderRows = () => {
        rowsBox.replaceChildren(...lanes.map((lane, i) => el('div', {
            className: 'bp-row',
            children: [
                selectEl(sideOptions, String(lane.a), v => { lanes[i].a = Number(v); refresh(); }),
                selectEl(dirOptions, lane.dir, v => { lanes[i].dir = v; refresh(); }),
                selectEl(sideOptions, String(lane.b), v => { lanes[i].b = Number(v); refresh(); }),
                button({ text: '×', title: 'Remove this lane', onClick: () => { lanes.splice(i, 1); refresh(); } }),
            ],
        })));
    };

    const add = button({
        text: '+ Lane', title: 'Add a lane between two free sides',
        onClick: () => {
            const used = new Set(lanes.flatMap(l => [l.a, l.b]));
            const free = [0, 1, 2, 3, 4, 5].filter(s => !used.has(s));
            const a = free[0] ?? 0;
            const b = free.find(s => s !== a && s !== (a + 1) % 6 && s !== (a + 5) % 6) ?? free[1] ?? (a + 3) % 6;
            lanes.push({ a, b, dir: 'both' });
            refresh();
        }
    });

    text.addEventListener('input', () => {
        const { matrix, problem } = parseBridgeText(text.value);
        textProblem = problem;
        if (matrix) lanes = lanesOfBridge(matrix);
        refresh({ fromText: true });
    });
    guardKeys(text, () => { if (!save.disabled) save.click(); });

    const close = () => hidePopup(BRIDGE_POPUP);
    const commit = (next) => {
        editor.saveState(label);
        hex.bridge = next;
        renderHex(editor, label);
        close();
    };
    save.addEventListener('click', () => {
        const m = normalizedBridge(matrixNow());
        commit(m);
        showToast(m ? `Bridge set on ${label}` : `Bridge removed from ${label}`, 'success', 2500);
    });
    remove.disabled = !hex.bridge;
    remove.addEventListener('click', () => { commit(null); showToast(`Bridge removed from ${label}`, 'success', 2500); });
    cancel.addEventListener('click', close);

    const content = el('div', {
        className: 'bp-dialog ui-stack ui-stack--normal',
        children: [
            el('div', { className: 'bp-muted', text: 'Lanes run through the system along its rim and connect the tiles at their ends. The system does not border the tiles across its lane sides. One lane per side; lanes may not cross.' }),
            el('div', { className: 'bp-body', children: [previewBox, el('div', { className: 'ui-stack ui-stack--tight', children: [rowsBox, add] })] }),
            el('label', { className: 'bp-label', text: 'Typed matrix (JSON bridgeLanes) or 9-hex:' }),
            text, hexLine, problemLine,
            el('div', { className: 'ui-btn-row', children: [save, remove, cancel] }),
        ],
    });
    showPopup({
        id: BRIDGE_POPUP, title: `⇶ Bridge — ${label}${hex.realId ? ` · ${hex.realId}` : ''}`, content,
        draggable: true, dragHandleSelector: '.popup-ui-titlebar', style: { width: '420px' },
    });
    refresh();
}

// ── Portals ──────────────────────────────────────────────────────────────────

/** Why this tile can't carry portals at all, or null. Not being a roundabout is a warning. */
export function portalTileProblem(editor, hex) {
    return portalHostProblem(hex, editor.hyperlaneMatrices);
}

/**
 * Opens the portal editor for one tile.
 * @param {any} editor
 * @param {string} label
 */
export function openPortalsDialog(editor, label) {
    const hex = editor.hexes[label];
    if (!hex) return;
    const tileProblem = portalTileProblem(editor, hex);
    const roundaboutWarning = canHoldPortals(hex.matrix)
        ? null
        : "This hyperlane isn't a roundabout. Portals sit on a roundabout's ring (place one from Hyperlane ▸ Place roundabout), or on an empty tile.";

    /** slot → {letter, flow} */
    const rows = Array.from({ length: PORTAL_SLOTS }, () => ({ letter: '', flow: 'both' }));
    const load = (slots) => {
        for (const r of rows) { r.letter = ''; r.flow = 'both'; }
        for (const s of slots || []) rows[s.slot] = { letter: s.letter, flow: s.flow };
    };
    load(hex.portals);

    const letterOptions = [['', '—'], ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => [l, l])];
    const flowOptions = [['both', 'two-way'], ['entry', '> entry-only'], ['exit', '< exit-only']];
    const slotName = (k) => (k === 0 ? 'centre' : `${k} ${SIDE_NAMES[k - 1]}–${SIDE_NAMES[k % 6]}`);

    const rowsBox = el('div', { className: 'bp-rows' });
    const text = /** @type {HTMLInputElement} */ (el('input', {
        className: 'input-dark bp-text', attrs: { spellcheck: 'false', autocomplete: 'off', placeholder: 'A, 3=B>, C<   or   0A3B>' }
    }));
    const compactLine = el('div', { className: 'bp-muted' });
    const linksLine = el('div', { className: 'bp-muted' });
    const problemLine = el('div', { className: 'bp-problem' });
    const warnLine = el('div', { className: 'bp-warning', text: tileProblem ? '' : roundaboutWarning || '' });
    const previewBox = el('div', { className: 'bp-preview-box' });
    const save = button({ text: 'Save', variant: 'primary' });
    const remove = button({ text: 'Remove portals' });
    const cancel = button({ text: 'Cancel' });
    let parsed = { slots: [], problem: null, movedToCentre: null };

    const typedFromRows = () => rows
        .map((r, slot) => (r.letter ? `${slot}=${r.letter}${flowMarker(r.flow)}` : ''))
        .filter(Boolean).join(', ');

    const refresh = ({ fromText = false } = {}) => {
        parsed = parseAnyPortals(fromText ? text.value : typedFromRows());
        if (!fromText && !parsed.problem) text.value = describePortals(parsed.slots);
        // The rows show what will be saved, so the first portal visibly lands in the centre.
        if (!parsed.problem) load(parsed.slots);
        compactLine.textContent = parsed.slots.length ? `Compact (text Export, lore !setportals): ${encodeCompact(parsed.slots)}` : 'No portals.';
        const moved = parsed.movedToCentre ? `${parsed.movedToCentre} moves to the centre (the first portal always sits there). ` : '';
        problemLine.textContent = tileProblem || parsed.problem || '';
        linksLine.textContent = moved + linksText(editor, label, parsed.slots);
        save.disabled = !!(tileProblem || parsed.problem) || (!parsed.slots.length && !hex.portals);
        replacePreview(previewBox, previewSvg(hex.matrix, (layer, center, R, hasRing) => {
            if (parsed.slots.length) {
                drawPortals(layer, { center, radius: R, viaLabel: 'preview', portals: parsed.slots, withRing: !hasRing, invalid: !canHoldPortals(hex.matrix) });
            }
        }));
        renderRows();
    };

    const renderRows = () => {
        rowsBox.replaceChildren(...rows.map((r, slot) => {
            const swatch = el('span', { className: 'bp-swatch', style: { background: r.letter ? portalColour(r.letter) : 'transparent' } });
            return el('div', {
                className: 'bp-row',
                children: [
                    el('span', { className: 'bp-slot', text: slotName(slot) }),
                    swatch,
                    selectEl(letterOptions, r.letter, v => { rows[slot].letter = v; refresh(); }),
                    selectEl(flowOptions, r.flow, v => { rows[slot].flow = v; refresh(); }),
                ],
            });
        }));
    };

    text.addEventListener('input', () => refresh({ fromText: true }));
    guardKeys(text, () => { if (!save.disabled) save.click(); });

    const close = () => hidePopup(PORTAL_POPUP);
    const commit = (next) => {
        editor.saveState(label);
        hex.portals = next;
        renderHex(editor, label);
        close();
    };
    save.addEventListener('click', () => {
        const next = parsed.slots.length ? parsed.slots : null;
        commit(next);
        showToast(next ? `Portals on ${label}: ${describePortals(next)}` : `Portals removed from ${label}`, 'success', 3000);
    });
    remove.disabled = !hex.portals?.length;
    remove.addEventListener('click', () => { commit(null); showToast(`Portals removed from ${label}`, 'success', 2500); });
    cancel.addEventListener('click', close);

    const content = el('div', {
        className: 'bp-dialog ui-stack ui-stack--normal',
        children: [
            el('div', { className: 'bp-muted', text: 'A ship on this ring can take a portal to the ring of every other hyperlane with the same letter, at no movement cost. Entry-only: ships jump in here, never arrive. Exit-only: ships arrive here, never jump in.' }),
            warnLine,
            el('div', { className: 'bp-body', children: [previewBox, rowsBox] }),
            el('label', { className: 'bp-label', text: 'As text (JSON portals):' }),
            text, compactLine, linksLine, problemLine,
            el('div', { className: 'ui-btn-row', children: [save, remove, cancel] }),
        ],
    });
    showPopup({
        id: PORTAL_POPUP, title: `◉ Portals — ${label}`, content,
        draggable: true, dragHandleSelector: '.popup-ui-titlebar', style: { width: '440px' },
    });
    refresh();
}

/** "A links to 205, 310 · B has no other end yet" for the letters on this tile. */
function linksText(editor, label, slots) {
    if (!slots.length) return '';
    const parts = slots.map(({ letter }) => {
        const others = Object.entries(editor.hexes)
            .filter(([l, h]) => l !== label && h.portals?.some(p => p.letter === letter))
            .map(([l]) => l).sort();
        return others.length ? `${letter} links to ${others.join(', ')}` : `${letter} has no other end yet`;
    });
    return parts.join(' · ');
}
