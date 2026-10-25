// @ts-check
/**
 * Galaxies, the pure part: names, which boards a set of positions uses, and where each
 * board is drawn.
 *
 * A galaxy is one of the bot's boards: the main map, plus up to seven extra boards a–g
 * whose positions carry the board letter (`a000`, `b401`). The bot takes them only in Fog
 * of War games, keeps hex adjacency inside each board, and lets wormholes, custom
 * adjacencies and adjacency overrides connect them. See hexGrid.js for how the editor
 * keeps their coordinates apart, and galaxies.js for the drawing.
 *
 * Everything in this file is DOM-free, so it loads straight into node for the tests.
 */

import { GALAXY_BOARDS, MAX_BOARD_RINGS, boardOf, ringOfLabel } from '../utils/hexGrid.js';
import { SECTOR_NAME_RE, isReservedSectorName, normalizeSectorName } from './mapSectors.js';

/** The JSON id of each galaxy: `main` for the main board, else the board letter. */
export const GALAXY_IDS = Object.freeze(['main', ...GALAXY_BOARDS]);

/** @param {string} board  '' or 'a'–'g' */
export function galaxyId(board) {
    return board || 'main';
}

/**
 * The bot's automatic galaxy names (GalaxyNames.NAMES). A galaxy left unnamed gets one of
 * these, picked by a hash of the game's name — so a name chosen here from the same list
 * can collide with an automatic pick the editor cannot predict, and the bot refuses it.
 * `milky-way` is main's own automatic name, so it is only safe on main.
 */
export const BOT_AUTO_GALAXY_NAMES = Object.freeze([
    'milky-way', 'andromeda', 'triangulum', 'whirlpool', 'sombrero', 'pinwheel', 'cartwheel', 'sunflower',
    'cigar', 'black-eye', 'tadpole', 'sculptor', 'fornax', 'magellan', 'centaurus', 'bodes',
    'antennae', 'mice', 'hoags', 'needle', 'condor', 'medusa', 'phantom', 'southern-pinwheel',
]);

/** Galaxy names follow the bot's sector rules. */
export const normalizeGalaxyName = normalizeSectorName;

/**
 * Why a galaxy cannot have `name`, or null when it can. Empty is fine: it means "let the
 * bot name it".
 *
 * @param {string} name
 * @param {string} id      the galaxy being named
 * @param {Record<string, string>} names  every galaxy's current name, by id
 * @returns {string|null}
 */
export function galaxyNameProblem(name, id, names) {
    if (!name) return null;
    if (!SECTOR_NAME_RE.test(name)) return 'Use lowercase letters, digits and -, up to 20 characters.';
    if (isReservedSectorName(name)) return '`main`, `fracture` and `board-a` to `board-g` are reserved by the bot.';
    const taken = Object.entries(names || {}).find(([other, n]) => other !== id && n === name);
    if (taken) return `Galaxy ${taken[0]} is already called ${name}.`;
    return null;
}

/**
 * A softer warning: the name is allowed but may be refused by the bot.
 * @param {string} name @param {string} id
 * @returns {string|null}
 */
export function galaxyNameRisk(name, id) {
    if (!name) return null;
    if (name === 'milky-way' && id === 'main') return null;
    if (BOT_AUTO_GALAXY_NAMES.includes(name)) {
        return `${name} is one of the bot's automatic galaxy names; it can clash with the name the bot picks for another galaxy. Choose one outside that list to be safe.`;
    }
    return null;
}

/**
 * Keep only valid galaxy names, by id. What the import and session restore read.
 * @param {any} raw
 * @returns {Record<string, string>}
 */
export function cleanGalaxyNames(raw) {
    /** @type {Record<string, string>} */
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [rawId, rawName] of Object.entries(raw)) {
        const id = String(rawId).trim().toLowerCase();
        const name = normalizeGalaxyName(String(rawName ?? ''));
        if (!GALAXY_IDS.includes(id) || !name) continue;
        if (galaxyNameProblem(name, id, out)) continue;
        out[id] = name;
    }
    return out;
}

/**
 * The extra boards a set of positions uses, and how many rings each needs to hold them.
 * `declared` (a saved file's own record of its boards) wins where it says more, so an
 * empty board — or empty outer rings — survive a save and load.
 *
 * @param {Iterable<string>} positions
 * @param {any} [declared]  `{a: 3, ...}`
 * @returns {Record<string, number>}
 */
export function boardRingsFrom(positions, declared) {
    /** @type {Record<string, number>} */
    const rings = {};
    for (const pos of positions) {
        const board = boardOf(String(pos));
        if (!board) continue;
        const ring = ringOfLabel(String(pos)) ?? 0;
        rings[board] = Math.max(rings[board] ?? 1, ring);
    }
    if (declared && typeof declared === 'object') {
        for (const [b, n] of Object.entries(declared)) {
            if (!GALAXY_BOARDS.includes(b)) continue;
            const count = Number.parseInt(/** @type {any} */ (n), 10);
            if (Number.isFinite(count)) rings[b] = Math.max(rings[b] ?? 1, count);
        }
    }
    for (const b of Object.keys(rings)) rings[b] = Math.max(1, Math.min(MAX_BOARD_RINGS, rings[b]));
    return rings;
}

/**
 * Where each extra board's centre is drawn: left to right after the main map, in letter
 * order as the bot lays them out, each as wide as its own rings so a small board does not
 * leave a gap the size of a large one.
 *
 * @param {Record<string, number>} boards  rings per board
 * @param {number} mainRight  x of the main map's right edge, corners included
 * @param {number} R          hex radius
 * @returns {Record<string, number>}  x of each board's centre hex
 */
export function boardOriginsX(boards, mainRight, R) {
    /** @type {Record<string, number>} */
    const out = {};
    const gap = R * 3;
    let right = mainRight;
    for (const b of GALAXY_BOARDS) {
        const rings = boards[b];
        if (!rings) continue;
        const half = rings * 1.5 * R + R;
        out[b] = right + gap + half;
        right = out[b] + half;
    }
    return out;
}

/** The first board letter not in use, or null with all seven taken. */
export function nextFreeBoard(boards) {
    return GALAXY_BOARDS.find(b => !boards?.[b]) ?? null;
}
