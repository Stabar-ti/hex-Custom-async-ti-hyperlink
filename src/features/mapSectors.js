// @ts-check
/**
 * Map sectors: named regions of the map, painted hex by hex.
 *
 * "Sector" already means a hex's base type in this codebase (setSectorType, sectorColors,
 * the map string), so this feature is called a *map sector* in code: `hex.mapSector` holds
 * the name of the one sector a hex belongs to, or nothing. One field per hex is what makes
 * overlap impossible, which is deliberate — the bot allows its manual sectors to overlap,
 * but a painted map is easier to read and to reason about when it does not.
 *
 * Void hexes can belong to a sector. They are not tiles, but a region of the map is a
 * region of positions, and the bot's own circles include empty positions too.
 *
 * How the bot sees sectors (TI4_map_generator_bot, MapSegment / MapSectorJsonService):
 * it never stores member lists. A manual sector is a centre plus a rule, attached to the
 * centre tile in mapInfo as `sector: {type, distance, name}`:
 *
 *   manual_circle  every grid position within `distance` hex steps of the centre
 *   manual_auto    the connected group of placed tiles grown from the centre tile, linked
 *                  by grid distance <= gap + 1 and by custom adjacencies / adjacency
 *                  overrides (wormholes do not count), clipped to `distance` if it is > 0
 *
 * So the editor writes every sector as an explicit list (the top-level `sectors` key, which
 * the bot ignores until it learns to read it), and *also* writes the bot-native form when a
 * sector happens to be exactly a circle or a cluster — see botEquivalent. The rules here
 * mirror MapSegment.resolve and MapFrame.cluster / positionsWithin.
 *
 * Everything in this file is DOM-free, so it loads straight into node for the tests.
 */

import { axialDistance, boardOf, buildCoordIndex, coordKey, hasAxialCoords } from '../utils/hexGrid.js';

/** The bot's limits: MapSegment.MAX_SEGMENTS, MAX_RADIUS, MAX_GAP. */
export const BOT_MAX_SECTORS = 20;
export const MAX_SECTOR_RADIUS = 9;
export const MAX_SECTOR_GAP = 2;

/** MapSegment.isValidName. */
export const SECTOR_NAME_RE = /^[a-z0-9-]{1,20}$/;

/**
 * The bot's automatic sector names (image/SectorNames.java), offered as suggestions so a
 * painted map reads like one the bot named itself.
 */
export const SECTOR_NAME_SUGGESTIONS = Object.freeze([
    'andromeda', 'antlia', 'apus', 'aquarius', 'aquila', 'ara', 'aries', 'auriga',
    'bootes', 'caelum', 'camelopardalis', 'canes-venatici', 'canis-major', 'canis-minor', 'capricornus', 'carina',
    'cassiopeia', 'cepheus', 'cetus', 'chamaeleon', 'circinus', 'columba', 'coma-berenices', 'corona-australis',
    'corona-borealis', 'corvus', 'crater', 'crux', 'cygnus', 'delphinus', 'dorado', 'draco',
    'equuleus', 'eridanus', 'fornax', 'gemini', 'grus', 'hercules', 'horologium', 'hydra',
    'hydrus', 'indus', 'lacerta', 'leo', 'leo-minor', 'lepus', 'libra', 'lupus',
    'lynx', 'lyra', 'mensa', 'microscopium', 'monoceros', 'musca', 'norma', 'octans',
    'ophiuchus', 'orion', 'pavo', 'pegasus', 'perseus', 'phoenix', 'pictor', 'pisces',
    'piscis-austrinus', 'puppis', 'pyxis', 'reticulum', 'sagitta', 'sagittarius', 'scorpius', 'sculptor',
    'scutum', 'serpens', 'sextans', 'taurus', 'telescopium', 'triangulum', 'triangulum-australe', 'tucana',
    'ursa-major', 'ursa-minor', 'vela', 'virgo', 'volans', 'vulpecula',
]);

// ── Names ────────────────────────────────────────────────────────────────────

/** MapSegment.isReservedName: `main`, `fracture` and `board-a` … `board-g`. */
export function isReservedSectorName(name) {
    return name === 'main' || name === 'fracture' || /^board-[a-g]$/.test(name);
}

/**
 * Turn typed text into something that can be a sector name: lowercase, spaces and
 * underscores to `-`, anything else the bot rejects dropped, at most 20 characters.
 * @param {string} raw
 */
export function normalizeSectorName(raw) {
    return String(raw ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 20);
}

/**
 * Why `name` cannot be a sector name, or null when it can.
 * @param {string} name
 * @returns {string|null}
 */
export function sectorNameProblem(name) {
    if (!name) return 'A sector needs a name.';
    if (!SECTOR_NAME_RE.test(name)) return 'Use lowercase letters, digits and -, up to 20 characters.';
    if (isReservedSectorName(name)) return '`main`, `fracture` and `board-a` to `board-g` are reserved by the bot.';
    return null;
}

/**
 * The first suggestion not already taken.
 * @param {Iterable<string>} taken
 */
export function suggestSectorName(taken) {
    const used = new Set(taken);
    const free = SECTOR_NAME_SUGGESTIONS.find(n => !used.has(n));
    if (free) return free;
    for (let i = 2; ; i++) {
        const n = `sector-${i}`;
        if (!used.has(n)) return n;
    }
}

// ── Colours ──────────────────────────────────────────────────────────────────
//
// Sectors are coloured like a political map: two sectors that touch never share a colour.
// By the four colour theorem four colours are enough for any map whose regions are each in
// one piece, which a hex grid of sectors is. The first four below are the ones used; the
// rest are only reached when four cannot do it — a sector painted in several separate
// pieces can make a map that needs a fifth.
//
// They used to come from a hash of the name, which needed no state but gave hues that
// were effectively random: inner-belt, andromeda and lower-reaches landed within 7° of
// each other on the wheel, three sectors in one green.
//
// Saturated on purpose: these sit as a tint over the tiles, and the pale atlas shades
// disappear into a tile image.

/** Red, blue, yellow, green, then the extras. */
export const SECTOR_PALETTE = Object.freeze([
    '#ff3b30', '#1e78ff', '#ffd400', '#12c24f',
    '#ff2bd6', '#00cfe8', '#ff8a00', '#9b5cff', '#a0e000', '#ffffff',
]);

/** How many palette colours a sector map uses before it needs the extras. */
export const SECTOR_BASE_COLOURS = 4;

/**
 * Which sectors touch: share a hex edge. Galaxies never touch each other, since their hexes
 * are never grid neighbours (hexGrid.js).
 * @param {Record<string, any>} hexes
 * @returns {Map<string, Set<string>>}
 */
export function sectorAdjacency(hexes) {
    /** @type {Map<string, Set<string>>} */
    const touching = new Map();
    const coordIndex = buildCoordIndex(hexes);
    const DIRS = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
    for (const hex of Object.values(hexes || {})) {
        const a = hex?.mapSector;
        if (!a || !hasAxialCoords(hex)) continue;
        if (!touching.has(a)) touching.set(a, new Set());
        for (const [dq, dr] of DIRS) {
            const label = coordIndex.get(coordKey(hex.q + dq, hex.r + dr));
            const b = label ? hexes[label]?.mapSector : null;
            if (b && b !== a) touching.get(a)?.add(b);
        }
    }
    return touching;
}

/**
 * Give every sector a palette index so that touching sectors differ, using as few colours
 * as the map allows — four, unless it cannot be done in four.
 *
 * A backtracking search, most-connected sector first. Each sector tries the colour it had
 * last time first (`previous`), so painting one sector does not reshuffle the rest; a
 * sector only changes colour when a new neighbour leaves it no choice. Sector maps are a
 * few dozen regions at most, where this is instant; a step cap stops a pathological case
 * from hanging, and falls back to a greedy colouring that may use more colours.
 *
 * @param {Iterable<string>} names  every sector, including ones with no hexes yet
 * @param {Map<string, Set<string>>} touching  from sectorAdjacency
 * @param {Record<string, number>} [previous]  name → palette index from the last colouring
 * @returns {Record<string, number>} name → palette index
 */
export function colourSectors(names, touching, previous = {}) {
    const nodes = [...new Set(names)].sort((a, b) =>
        (touching.get(b)?.size ?? 0) - (touching.get(a)?.size ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
    const neighbours = (/** @type {string} */ n) => touching.get(n) ?? new Set();

    for (let k = SECTOR_BASE_COLOURS; k <= SECTOR_PALETTE.length; k++) {
        /** @type {Record<string, number>} */
        const colour = {};
        let steps = 0;
        const order = (/** @type {string} */ n) => {
            const prev = previous[n];
            const all = Array.from({ length: k }, (_, i) => i);
            return Number.isInteger(prev) && prev < k ? [prev, ...all.filter(i => i !== prev)] : all;
        };
        const place = (/** @type {number} */ i) => {
            if (i === nodes.length) return true;
            if (++steps > 200000) return false;
            const n = nodes[i];
            for (const c of order(n)) {
                if ([...neighbours(n)].some(m => colour[m] === c)) continue;
                colour[n] = c;
                if (place(i + 1)) return true;
            }
            delete colour[n];
            return false;
        };
        if (place(0)) return colour;
        if (steps > 200000) break;
    }

    // Greedy: the lowest colour no neighbour has, cycling the palette if it runs out.
    /** @type {Record<string, number>} */
    const colour = {};
    for (const n of nodes) {
        const used = new Set([...neighbours(n)].map(m => colour[m]));
        let c = 0;
        while (used.has(c) && c < SECTOR_PALETTE.length) c++;
        colour[n] = c % SECTOR_PALETTE.length;
    }
    return colour;
}

// ── Positions ────────────────────────────────────────────────────────────────

/** MapFrame.POSITION_ORDER: shorter labels first, then alphabetical. */
export function comparePositions(a, b) {
    return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * Whether a hex can be in a sector. Corners cannot (MapSegment.canJoinSector), and they are
 * the only hexes without axial coordinates.
 */
export function canJoinSector(hex) {
    return hasAxialCoords(hex);
}

/**
 * Whether a hex is a tile the bot will hold, i.e. one exportMapInfo writes to mapInfo.
 * Mirrors the tileID rules there: drawn hyperlane links, a home system, or a real system.
 */
export function isPlacedForBot(hex) {
    if (!hex) return false;
    if (hex.realId || hex.systemId) return true;
    if (hex.baseType === 'homesystem') return true;
    return Array.isArray(hex.matrix) && hex.matrix.some(row => Array.isArray(row) && row.some(v => v));
}

/**
 * Every sector on the map and its members, in position order.
 * @param {Record<string, any>} hexes
 * @returns {Map<string, string[]>}
 */
export function listSectors(hexes) {
    /** @type {Map<string, string[]>} */
    const out = new Map();
    for (const [label, hex] of Object.entries(hexes || {})) {
        const name = hex?.mapSector;
        if (!name) continue;
        if (!out.has(name)) out.set(name, []);
        out.get(name)?.push(label);
    }
    for (const members of out.values()) members.sort(comparePositions);
    return new Map([...out].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * Grid positions within `radius` steps of `centre` (MapFrame.positionsWithin), limited to
 * the hexes this map has. Corners are never included.
 * @param {Record<string, any>} hexes
 * @param {string} centre
 * @param {number} radius
 * @returns {string[]}
 */
export function circlePositions(hexes, centre, radius) {
    const c = hexes?.[centre];
    if (!canJoinSector(c)) return [];
    const out = [];
    for (const [label, hex] of Object.entries(hexes)) {
        if (canJoinSector(hex) && axialDistance(c, hex) <= radius) out.push(label);
    }
    return out.sort(comparePositions);
}

/**
 * Links between placed tiles that are not grid distance: custom adjacencies and adjacency
 * overrides, both ways (MapSegment.adjacencyLinks). Wormholes deliberately do not count.
 * @param {Record<string, any>} hexes
 * @param {Set<string>} placed
 * @returns {Map<string, Set<string>>}
 */
function adjacencyLinks(hexes, placed) {
    /** @type {Map<string, Set<string>>} */
    const links = new Map();
    const link = (from, to) => {
        if (!placed.has(from) || !placed.has(to)) return;
        // A sector never spans two galaxies, even where a custom link joins them.
        if (boardOf(from) !== boardOf(to)) return;
        if (!links.has(from)) links.set(from, new Set());
        if (!links.has(to)) links.set(to, new Set());
        links.get(from)?.add(to);
        links.get(to)?.add(from);
    };
    for (const [label, hex] of Object.entries(hexes)) {
        for (const target of Object.keys(hex?.customAdjacents || {})) link(label, target);
        for (const target of Object.values(hex?.adjacencyOverrides || {})) {
            if (typeof target === 'string') link(label, target);
        }
    }
    return links;
}

/**
 * The placed tiles of the map a cluster can grow over: tiles the bot will hold, minus the
 * corners (MapSegment.placedGridPositions).
 * @param {Record<string, any>} hexes
 */
function placedGridPositions(hexes) {
    const placed = new Set();
    for (const [label, hex] of Object.entries(hexes)) {
        if (canJoinSector(hex) && isPlacedForBot(hex)) placed.add(label);
    }
    return placed;
}

/**
 * The cluster the bot grows from `centre` (MapSegment.resolve for a CLUSTER): the connected
 * group of placed tiles, joined by grid distance <= gap + 1 and by custom links, clipped to
 * `cap` steps from the centre when cap > 0. With no tile at the centre it is the centre
 * alone, as in the bot.
 *
 * @param {Record<string, any>} hexes
 * @param {string} centre
 * @param {number} gap  0..2
 * @param {number} [cap] 0 = no cap
 * @returns {string[]}
 */
export function clusterPositions(hexes, centre, gap, cap = 0) {
    if (!canJoinSector(hexes?.[centre])) return [];
    const placed = placedGridPositions(hexes);
    if (!placed.has(centre)) return [centre];

    const reach = Math.max(0, Math.min(MAX_SECTOR_GAP, gap | 0)) + 1;
    const links = adjacencyLinks(hexes, placed);
    const coordIndex = buildCoordIndex(hexes);

    const cluster = new Set([centre]);
    const frontier = [centre];
    while (frontier.length) {
        const pos = /** @type {string} */ (frontier.pop());
        const h = hexes[pos];
        const nearby = [];
        for (let dq = -reach; dq <= reach; dq++) {
            for (let dr = Math.max(-reach, -dq - reach); dr <= Math.min(reach, -dq + reach); dr++) {
                const label = coordIndex.get(coordKey(h.q + dq, h.r + dr));
                if (label) nearby.push(label);
            }
        }
        for (const l of links.get(pos) || []) nearby.push(l);
        for (const n of nearby) {
            if (placed.has(n) && !cluster.has(n)) {
                cluster.add(n);
                frontier.push(n);
            }
        }
    }

    let members = [...cluster];
    if (cap > 0) {
        const c = hexes[centre];
        members = members.filter(l => axialDistance(c, hexes[l]) <= cap);
    }
    return members.sort(comparePositions);
}

// ── The bot-native form ──────────────────────────────────────────────────────

/**
 * @typedef {object} BotSector
 * @property {'manual_circle'|'manual_auto'} type
 * @property {string} centre
 * @property {number} distance
 */

/** @param {string[]} a @param {string[]} b  both sorted */
function sameMembers(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * The bot sector that resolves to exactly `members`, or null if there is none.
 *
 * The centre has to be a placed tile: the `sector` field rides on the centre's mapInfo
 * entry, and only placed tiles have one. A circle is preferred over a cluster, since it
 * does not change when tiles are added later.
 *
 * @param {Record<string, any>} hexes
 * @param {string[]} members  sorted with comparePositions
 * @param {number} gap
 * @returns {BotSector|null}
 */
export function botEquivalent(hexes, members, gap) {
    if (!members.length) return null;
    const centres = members.filter(l => isPlacedForBot(hexes[l]) && canJoinSector(hexes[l]));

    for (const centre of centres) {
        const c = hexes[centre];
        const radius = Math.max(...members.map(l => axialDistance(c, hexes[l])));
        if (radius > MAX_SECTOR_RADIUS) continue;
        if (sameMembers(circlePositions(hexes, centre, radius), members)) {
            return { type: 'manual_circle', centre, distance: radius };
        }
    }

    // A cluster only ever holds placed tiles.
    if (centres.length !== members.length) return null;
    if (sameMembers(clusterPositions(hexes, centres[0], gap, 0), members)) {
        return { type: 'manual_auto', centre: centres[0], distance: 0 };
    }
    for (const centre of centres) {
        const c = hexes[centre];
        const cap = Math.max(...members.map(l => axialDistance(c, hexes[l])));
        if (cap < 1 || cap > MAX_SECTOR_RADIUS) continue;
        if (sameMembers(clusterPositions(hexes, centre, gap, cap), members)) {
            return { type: 'manual_auto', centre, distance: cap };
        }
    }
    return null;
}

/** How a bot sector reads in the panel: "circle r2 @ 000". */
export function describeBotSector(bot) {
    if (!bot) return 'editor only';
    if (bot.type === 'manual_circle') return `circle r${bot.distance} @ ${bot.centre}`;
    return bot.distance > 0
        ? `cluster ≤${bot.distance} @ ${bot.centre}`
        : `cluster @ ${bot.centre}`;
}

/**
 * @typedef {object} SectorReport
 * @property {string} name
 * @property {string[]} positions
 * @property {BotSector|null} bot
 * @property {string|null} problem  why the name will not import, if it will not
 * @property {number} pieces  how many separate pieces it is in; 1 is the only allowed answer
 */

/**
 * Every sector with its bot-native form, for the panel and for the export.
 * @param {Record<string, any>} hexes
 * @param {number} gap
 * @returns {SectorReport[]}
 */
export function sectorReports(hexes, gap) {
    return [...listSectors(hexes)].map(([name, positions]) => ({
        name,
        positions,
        bot: botEquivalent(hexes, positions, gap),
        problem: sectorNameProblem(name),
        pieces: sectorPieces(hexes, positions).length,
    }));
}

// ── One piece ────────────────────────────────────────────────────────────────
//
// A sector is one connected region: every hex in it can be reached from every other by
// stepping across shared hex edges without leaving the sector. Wormholes and custom links
// do not count — this is about the shape on the map.
//
// It is enforced where sectors change rather than repaired afterwards: every edit goes
// through one check (wouldSplitSector), and an edit that would leave any sector in more
// than one piece is refused whole. Maps imported with split sectors are let in and
// flagged, so they can be fixed.

/**
 * The separate pieces `members` fall into.
 * @param {Record<string, any>} hexes
 * @param {string[]} members
 * @returns {string[][]}
 */
export function sectorPieces(hexes, members) {
    const inSector = new Set(members);
    const coordIndex = buildCoordIndex(hexes);
    const DIRS = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
    const seen = new Set();
    const pieces = [];
    for (const start of members) {
        if (seen.has(start)) continue;
        const piece = [];
        const stack = [start];
        seen.add(start);
        while (stack.length) {
            const label = /** @type {string} */ (stack.pop());
            piece.push(label);
            const h = hexes[label];
            if (!hasAxialCoords(h)) continue;
            for (const [dq, dr] of DIRS) {
                const n = coordIndex.get(coordKey(h.q + dq, h.r + dr));
                if (n && inSector.has(n) && !seen.has(n)) {
                    seen.add(n);
                    stack.push(n);
                }
            }
        }
        pieces.push(piece.sort(comparePositions));
    }
    return pieces;
}

/**
 * Would moving `labels` into sector `name` (or out of every sector, with null) leave any
 * sector it touches in more than one piece? The sector gaining hexes is checked, and every
 * sector losing some — a fill or a brush stroke can cut a neighbour in two.
 *
 * A sector that was already split (from an import) is only refused if the edit makes it
 * worse, so the hexes that would fix it can still be painted.
 *
 * @param {Record<string, any>} hexes
 * @param {string[]} labels
 * @param {string|null} name
 * @returns {{name: string, pieces: number}|null}  the sector that would split, or null
 */
export function wouldSplitSector(hexes, labels, name) {
    const moving = new Set(labels.filter(l => canJoinSector(hexes[l]) && (hexes[l].mapSector || null) !== name));
    if (!moving.size) return null;

    const affected = new Set();
    if (name) affected.add(name);
    for (const l of moving) if (hexes[l].mapSector) affected.add(hexes[l].mapSector);

    const all = listSectors(hexes);
    for (const s of affected) {
        const before = all.get(s) || [];
        const after = before.filter(l => !moving.has(l));
        if (s === name) after.push(...moving);
        if (!after.length) continue;
        // A whole sector, or a new one, counts as one piece; an imported split one as what
        // it is. Anything that adds a piece is refused.
        const piecesBefore = Math.max(1, sectorPieces(hexes, before).length);
        const piecesAfter = sectorPieces(hexes, after).length;
        if (piecesAfter > piecesBefore) return { name: s, pieces: piecesAfter };
    }
    return null;
}

/**
 * The map-wide warnings the panel shows above the list.
 * @param {SectorReport[]} reports
 * @returns {string[]}
 */
export function sectorWarnings(reports) {
    const out = [];
    const native = reports.filter(r => r.bot && !r.problem).length;
    if (native > BOT_MAX_SECTORS) {
        out.push(`The bot keeps at most ${BOT_MAX_SECTORS} sectors; ${native} are bot-compatible.`);
    }
    const editorOnly = reports.filter(r => !r.bot).length;
    if (editorOnly) {
        out.push(`${editorOnly} sector${editorOnly === 1 ? ' is' : 's are'} not a bot circle or cluster. `
            + 'They are exported, but the bot does not use them yet.');
    }
    const bad = reports.filter(r => r.problem).map(r => r.name);
    if (bad.length) out.push(`Names the bot will reject: ${bad.join(', ')}.`);
    const split = reports.filter(r => r.pieces > 1).map(r => `${r.name} (${r.pieces} pieces)`);
    if (split.length) {
        out.push(`Sectors must be one connected region. Split: ${split.join(', ')}. `
            + 'Join the pieces, or move all but one into other sectors.');
    }
    return out;
}

// ── Export / import ──────────────────────────────────────────────────────────

/**
 * What exportMapInfo adds for sectors: the top-level list, the bot-native `sector` field by
 * centre position, and the gap.
 *
 * @param {Record<string, any>} hexes
 * @param {number} gap
 * @returns {{sectors: Array<{name: string, positions: string[]}>,
 *            native: Map<string, {type: string, distance: number, name: string}>,
 *            sectorGap: number}}
 */
export function buildSectorExport(hexes, gap) {
    const reports = sectorReports(hexes, gap);
    const native = new Map();
    let count = 0;
    for (const r of reports) {
        if (!r.bot || r.problem || count >= BOT_MAX_SECTORS) continue;
        // One sector per tile in the bot's format. Sectors cannot overlap here, so two
        // can only share a centre if one of them is not where its own members are.
        if (native.has(r.bot.centre)) continue;
        native.set(r.bot.centre, { type: r.bot.type, distance: r.bot.distance, name: r.name });
        count++;
    }
    return {
        sectors: reports.map(r => ({ name: r.name, positions: [...r.positions] })),
        native,
        sectorGap: clampGap(gap),
    };
}

/** @param {any} gap */
export function clampGap(gap) {
    const n = Number.parseInt(gap, 10);
    return Number.isFinite(n) ? Math.max(0, Math.min(MAX_SECTOR_GAP, n)) : 0;
}

/**
 * The sector type names the bot accepts (MapSectorJsonService.Type): json names and aliases,
 * trimmed, lowercased, spaces to `_`.
 * @param {any} raw
 * @returns {'manual_circle'|'manual_auto'|'automatic'|null}
 */
export function parseBotSectorType(raw) {
    const t = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '_');
    if (t === 'manual_circle' || t === 'circle') return 'manual_circle';
    if (t === 'manual_auto' || t === 'cluster') return 'manual_auto';
    if (t === 'automatic' || t === 'auto') return 'automatic';
    return null;
}

/**
 * Work out every hex's sector from imported map JSON and write it to `hexes`.
 *
 * The explicit `sectors` list wins when the file has one: it is what this editor writes,
 * and it holds sectors the bot form cannot. Otherwise each tile's bot-native `sector` is
 * expanded by the bot's own rules, in file order; a hex already claimed keeps its first
 * sector, since sectors here cannot overlap. Automatic sectors are skipped for now.
 *
 * Call it after the tiles are placed: a cluster grows over them.
 *
 * @param {Record<string, any>} hexes
 * @param {any} data  the parsed map JSON
 * @returns {{gap: number, warnings: string[]}}
 */
export function applySectorImport(hexes, data) {
    const warnings = [];
    const gap = clampGap(data?.sectorGap);
    for (const hex of Object.values(hexes)) delete hex.mapSector;

    /** @param {string} pos */
    const resolve = pos => (/^(tl|tr|bl|br)$/i.test(pos) ? pos.toUpperCase() : pos);

    const claim = (name, positions, source) => {
        let clashes = 0;
        let skipped = 0;
        for (const raw of positions) {
            const pos = resolve(String(raw));
            const hex = hexes[pos];
            if (!canJoinSector(hex)) { skipped++; continue; }
            if (hex.mapSector && hex.mapSector !== name) { clashes++; continue; }
            hex.mapSector = name;
        }
        if (clashes) warnings.push(`${source} \`${name}\` overlaps an earlier sector on ${clashes} hex${clashes === 1 ? '' : 'es'}; those keep the earlier one.`);
        if (skipped) warnings.push(`${source} \`${name}\`: ${skipped} position${skipped === 1 ? ' is' : 's are'} not on this map or cannot be in a sector.`);
    };

    if (Array.isArray(data?.sectors) && data.sectors.length) {
        for (const s of data.sectors) {
            const name = normalizeSectorName(s?.name);
            const problem = sectorNameProblem(name);
            if (problem) { warnings.push(`Sector \`${s?.name}\` skipped: ${problem}`); continue; }
            claim(name, Array.isArray(s.positions) ? s.positions : [], 'Sector');
        }
        return { gap, warnings };
    }

    let automatic = 0;
    for (const tile of Array.isArray(data?.mapInfo) ? data.mapInfo : []) {
        const s = tile?.sector;
        if (!s) continue;
        const type = parseBotSectorType(s.type);
        if (type === 'automatic') { automatic++; continue; }
        if (!type) { warnings.push(`Tile ${tile.position}: unknown sector type \`${s.type}\`.`); continue; }
        const name = normalizeSectorName(s.name);
        const problem = sectorNameProblem(name);
        if (problem) { warnings.push(`Tile ${tile.position}: sector \`${s.name}\` skipped: ${problem}`); continue; }
        const centre = resolve(String(tile.position));
        const distance = Math.max(0, Math.min(MAX_SECTOR_RADIUS, Number(s.distance) || 0));
        const positions = type === 'manual_circle'
            ? circlePositions(hexes, centre, distance)
            : clusterPositions(hexes, centre, gap, distance);
        claim(name, positions, type === 'manual_circle' ? 'Circle' : 'Cluster');
    }
    if (automatic) {
        warnings.push('Automatic sectors are not supported in the editor yet and were left out.');
    }
    return { gap, warnings };
}

/**
 * The highest ring any sector position in imported JSON reaches, so the import can build a
 * map big enough for sectors that run into void beyond the last tile.
 * @param {any} data
 */
export function maxSectorRing(data) {
    let max = 0;
    for (const s of Array.isArray(data?.sectors) ? data.sectors : []) {
        for (const pos of Array.isArray(s?.positions) ? s.positions : []) {
            const m = String(pos).match(/^(\d+)\d{2}$/);
            if (m) max = Math.max(max, parseInt(m[1], 10));
        }
    }
    return max;
}
