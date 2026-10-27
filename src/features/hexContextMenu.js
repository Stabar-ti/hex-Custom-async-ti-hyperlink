// @ts-check
/**
 * The tile menu: right-click a tile with no tool armed.
 *
 * Right-click keeps its first meaning — put the armed tool down — and only when there is
 * nothing to put down does it open this. So it never competes with a tool for the click,
 * and "right-click twice" is always "stop, then show me what I can do here".
 *
 * Each group does to this one tile what its rail tool does to whichever tile you click
 * next, without arming the tool:
 *
 *   Wormholes ▸        toggle any of the bot's wormhole types on the tile
 *   Border anomalies ▸ pick a type, then click the neighbour whose edge it goes on
 *   Hyperlane ▸        start a lane here, or turn the tile into a roundabout
 *   Sector ▸           put the tile — or the selection it is part of — in a map sector
 *   Lore ▸            open the lore editor on the system or one of its planets
 */

import { wormholeTypes } from '../constants/constants.js';
import { loadBorderAnomalyTypes, getEnabledBorderAnomalyTypes, normalizeAnomalyId } from '../constants/borderAnomalies.js';
import { hasCommand, tryInvoke, COMMANDS } from '../core/registry.js';
import { planetDisplayName } from '../draw/hexAnchors.js';
import { normalizeLoreEntries, isNonEmptyLoreEntry } from '../modules/Lore/loreCore.js';
import { selectHex as extendLane, roundaboutPlan, placeRoundabout } from '../modules/Hyperlanes/hyperlaneEditing.js';
import { openContextMenu } from '../ui/contextMenu.js';
import { startBorderAnomalyPick } from './borderAnomalyPick.js';
import { removeBorderAnomalies } from './borderAnomalyPlacement.js';
import { selectedHexes } from './hexSelection.js';
import { canJoinSector, normalizeSectorName, sectorNameProblem, suggestSectorName } from './mapSectors.js';
import { assignMapSector, knownMapSectors, mapSectorColours } from './mapSectorEditing.js';
import { askText } from '../ui/askText.js';
/** @typedef {import('../ui/contextMenu.js').MenuItem} MenuItem */

/**
 * @param {any} editor
 * @param {string} label
 * @param {number} x  client coordinates of the right-click
 * @param {number} y
 */
export function openHexContextMenu(editor, label, x, y) {
    const hex = editor.hexes[label];
    if (!hex) return;
    openContextMenu({
        x, y,
        title: hex.realId ? `Tile ${label} · ${hex.realId}` : `Tile ${label}`,
        items: hexMenuItems(editor, label),
    });
}

/**
 * @param {any} editor
 * @param {string} label
 * @returns {MenuItem[]}
 */
export function hexMenuItems(editor, label) {
    /** @type {MenuItem[]} */
    const items = [
        { label: 'Wormholes', icon: '◎', submenu: () => wormholeItems(editor, label) },
        { label: 'Border anomalies', icon: '⌇', submenu: () => borderAnomalyItems(editor, label) },
        { label: 'Hyperlane', icon: '∿', submenu: () => hyperlaneItems(editor, label) },
        { label: 'Sector', icon: '⬣', submenu: () => sectorItems(editor, label) },
    ];
    // The Lore module provides its editor; a build without it has nothing to open.
    if (hasCommand(COMMANDS.openLoreEditor)) {
        items.push({ label: 'Lore', icon: '📜', submenu: () => loreItems(editor, label) });
    }
    return items;
}

// ── Sector ───────────────────────────────────────────────────────────────────

/**
 * Put the tile in a sector, or take it out. Right-clicking a tile that is part of a
 * selection of several acts on the whole selection, which is the quick way to turn a
 * shift-dragged region into a sector.
 *
 * @returns {MenuItem[]}
 */
function sectorItems(editor, label) {
    if (!canJoinSector(editor.hexes[label])) {
        return [{ label: 'Corner tiles cannot be in a sector', disabled: true }];
    }
    const selection = selectedHexes(editor);
    const targets = selection.length > 1 && selection.includes(label)
        ? selection.filter(l => canJoinSector(editor.hexes[l]))
        : [label];
    const many = targets.length > 1;
    const current = editor.hexes[label]?.mapSector || null;

    /** @param {string} name */
    const putIn = (name) => {
        assignMapSector(editor, targets, name);
        editor._activeMapSector = name;
    };

    /** @type {MenuItem[]} */
    const items = [];
    if (many) items.push({ group: `${targets.length} selected hexes` });
    const colours = mapSectorColours(editor);
    for (const name of knownMapSectors(editor)) {
        items.push({
            label: name,
            swatch: colours.get(name),
            checked: !many && current === name,
            onSelect: () => putIn(name),
        });
    }
    items.push({
        label: 'New sector…',
        icon: '+',
        onSelect: async () => {
            const name = await askText({
                title: '⬣ New sector',
                label: many ? `Name for a sector holding the ${targets.length} selected hexes:` : `Name for a sector holding ${label}:`,
                value: suggestSectorName(knownMapSectors(editor)),
                okLabel: 'Create',
                normalize: normalizeSectorName,
                validate: sectorNameProblem,
            });
            if (name) putIn(name);
        },
    });
    items.push({ separator: true });
    items.push({
        label: many ? 'Remove from their sectors' : 'Remove from sector',
        disabled: !targets.some(l => editor.hexes[l]?.mapSector),
        onSelect: () => assignMapSector(editor, targets, null),
    });
    return items;
}

// ── Wormholes ────────────────────────────────────────────────────────────────

/** @returns {MenuItem[]} */
function wormholeItems(editor, label) {
    const hex = editor.hexes[label];
    const inherent = new Set(hex?.inherentWormholes || []);
    const custom = new Set(hex?.customWormholes || []);
    return Object.entries(wormholeTypes).map(([type, { label: name, color }]) => {
        // The system's own wormholes come with the tile, and a toggle would only add or
        // remove a duplicate token on top of them.
        if (inherent.has(type)) {
            return { label: name, swatch: color, checked: true, disabled: true, hint: 'system', title: `${name} is part of this system` };
        }
        const on = custom.has(type);
        return {
            label: name,
            swatch: color,
            checked: on,
            title: on ? `Remove the ${name} wormhole from ${label}` : `Add a ${name} wormhole to ${label}`,
            onSelect: () => editor.toggleWormholeOnHex(label, type),
        };
    });
}

// ── Border anomalies ─────────────────────────────────────────────────────────

/** @returns {Promise<MenuItem[]>} */
async function borderAnomalyItems(editor, label) {
    await loadBorderAnomalyTypes();
    const types = getEnabledBorderAnomalyTypes();
    const hex = editor.hexes[label];

    /** How many of this tile's edges already carry each type. */
    const onEdges = new Map();
    for (const anomaly of Object.values(hex?.borderAnomalies || {})) {
        const id = normalizeAnomalyId(anomaly?.type);
        onEdges.set(id, (onEdges.get(id) || 0) + 1);
    }

    /** @type {MenuItem[]} */
    const items = Object.values(types).map(type => {
        const edges = onEdges.get(type.id) || 0;
        const both = type.bidirectional ? 'both sides' : 'one side';
        return {
            label: type.name,
            swatch: type.drawStyle?.color,
            hint: edges ? `${both} · on ${edges}` : both,
            title: `Place ${type.name} on an edge of ${label}, then click the neighbour across it`,
            // A keyboard Enter clicks with no pointer position; the hint then waits for the mouse.
            onSelect: (/** @type {MouseEvent} */ e) => startBorderAnomalyPick(editor, label, type.id,
                e?.detail ? { x: e.clientX, y: e.clientY } : {}),
        };
    });
    if (!items.length) {
        items.push({ label: 'No border anomaly types enabled', disabled: true });
    }
    const count = Object.keys(hex?.borderAnomalies || {}).length;
    items.push({ separator: true });
    items.push({
        label: 'Remove all from this tile',
        icon: '✕',
        disabled: !count,
        hint: count ? String(count) : '',
        title: 'Also removes the far half of each two-sided anomaly',
        onSelect: () => removeBorderAnomalies(editor, label),
    });
    return items;
}

// ── Hyperlane ────────────────────────────────────────────────────────────────

/** @returns {MenuItem[]} */
function hyperlaneItems(editor, label) {
    const plan = roundaboutPlan(editor, label);
    let roundaboutHint = '';
    let roundaboutTitle = 'Join every lane on this tile, and every lane running into it, at a roundabout';
    if (!plan.sides.length) {
        roundaboutHint = 'no lanes here';
        roundaboutTitle = 'No hyperlane runs into this tile yet — draw one first';
    } else if (!plan.changed) {
        roundaboutHint = 'already one';
        roundaboutTitle = 'Every lane here already meets at a roundabout';
    } else {
        roundaboutHint = `${plan.sides.length} side${plan.sides.length > 1 ? 's' : ''}`;
    }

    return [
        {
            label: 'Start hyperlane here',
            icon: '∿',
            title: 'Arms the Hyperlanes tool with this tile as the first point — click the next tile to draw',
            onSelect: () => startLaneAt(editor, label),
        },
        {
            label: 'Place roundabout',
            icon: '○',
            disabled: !plan.changed,
            hint: roundaboutHint,
            title: roundaboutTitle,
            onSelect: () => placeRoundabout(editor, label),
        },
    ];
}

/** Arms the Hyperlanes tool the way its rail button does, then starts the path here. */
function startLaneAt(editor, label) {
    const button = document.getElementById('toolHyperlanes');
    if (button && !button.classList.contains('active')) button.click();
    else if (!button) editor.setMode('hyperlane');
    if (editor.mode !== 'hyperlane') return;
    extendLane(editor, label);
}

// ── Lore ─────────────────────────────────────────────────────────────────────

/** @returns {MenuItem[]} */
function loreItems(editor, label) {
    const hex = editor.hexes[label];
    const count = (/** @type {any} */ list) => normalizeLoreEntries(list).filter(isNonEmptyLoreEntry).length;
    const hintFor = (/** @type {number} */ n) => (n ? `${n} entr${n > 1 ? 'ies' : 'y'}` : '');
    const open = (/** @type {object} */ ref) => tryInvoke(COMMANDS.openLoreEditor, ref);

    const systemCount = count(hex?.systemLore);
    /** @type {MenuItem[]} */
    const items = [{
        label: 'System',
        icon: '✦',
        hint: hintFor(systemCount),
        title: `Lore on the ${label} system as a whole`,
        onSelect: () => open({ kind: 'system', hexLabel: label }),
    }];

    const planets = hex?.planets || [];
    if (planets.length) items.push({ group: 'Planets' });
    planets.forEach((planet, planetIndex) => {
        const n = count(hex.planetLore?.[planetIndex]);
        items.push({
            label: planetDisplayName(planet, planetIndex),
            icon: '●',
            hint: hintFor(n),
            onSelect: () => open({ kind: 'planet', hexLabel: label, planetIndex }),
        });
    });
    return items;
}
