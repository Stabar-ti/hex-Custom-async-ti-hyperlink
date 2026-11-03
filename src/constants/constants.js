// @ts-check
// ───────────────────────────────────────────────────────────────
// constants.js
//
// Central definitions for all static values and type maps used in the
// TI4 mapping tool. Includes directions for hex math, color maps,
// label codes, available UI sector modes, emoji icons for effects,
// and wormhole definitions. These constants unify configuration
// for all rendering and logic throughout the project.
// ───────────────────────────────────────────────────────────────

/**
 * Maximum number of map rings (radius) supported by the UI.
 */
export const MAX_MAP_RINGS = 15;

/**
 * Labels for the four special corner hexes used in TI4 map layouts.
 */
export const CORNER_LABELS = ['TL', 'TR', 'BL', 'BR'];

/**
 * The 6 edge directions for moving on a hex grid (axial coordinates).
 * Used for pathfinding, neighbor logic, etc.
 *
 * Canonical definition now lives in utils/hexGrid.js — re-exported here so the
 * many existing `import { edgeDirections } from '.../constants.js'` sites keep
 * working. Prefer importing EDGE_DIRECTIONS from utils/hexGrid.js in new code.
 */
export { EDGE_DIRECTIONS as edgeDirections } from '../utils/hexGrid.js';

/**
 * Directions for building rings of hexes (used by the grid generator).
 */
export const ringDirections = [
  { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
  { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }
];

/**
 * Used for positioning the control panel (left/top/right).
 */
export const controlPositions = ['pos-left', 'pos-top', 'pos-right'];

/**
 * Relative (dx, dy) positions for stacking effect overlays on a hex.
 */
export const effectIconPositions = [
  { dx: -15, dy: -15 },
  { dx: 15, dy: -15 },
  { dx: -15, dy: 15 },
  { dx: 15, dy: 15 },
  // { dx: -25, dy: 25 } // Example: extend for more icons
];

/**
 * Maps effect type (as string) to emoji for overlay display.
 */
export const effectEmojiMap = {
  nebula: '☁️',
  supernova: '☀️',
  asteroid: '🪨',
  rift: '🕳️',
  scar: '☄️',  // Thunders Edge: Entropic Scar
  homesystem: '★'
};

/**
 * Emoji shown if an effect type is missing in the map.
 */
export const fallbackEffectEmoji = '?';

/**
 * Mapping of sector base types to their sector-code (for import/export).
 */
export const typeCodeMap = {
  '1 planet': '0b',
  '2 planet': '0b',
  '3 planet': '0b',
  'legendary planet': '0gray',
  'nebula': '0r',
  'asteroid': '0r',
  'rift': '0r',
  'special': '0r',
  'homesystem': '0g',
  'void': '-1',
  'empty': 'D118'
};

/**
 * Color palette for each base sector type, used for SVG fill.
 */
export const sectorColors = {
  '': '#eee',                      // Blank/default
  '1 planet': '#cce5ff',
  '2 planet': '#49a1ff',
  '3 planet': '#005cbf',
  'legendary planet': '#b300ff',
  'empty': '#fae7b5',           // Warm off-white
  'supernova': '#ffe5b4',
  'rift': '#7b7b7b',
  'nebula': '#e6ccff',
  'asteroid': '#d9d9d9',
  'special': '#ff83a0',
  'fracture': '#ffb3b3',        // Light red — fracture tile back
  'homesystem': '#068501',
  'void': '#2b2b2b',
  'hyperlane': '#d8d8d8'            // Blank hex with drawn hyperlane connections
};

/**
 * List of all selectable sector modes for UI palette, with display label and CSS class.
 */
export const sectorModes = [
  { mode: 'hyperlane', label: 'Hyperlane', cls: 'btn-empty' },
  { mode: '1 planet', label: '1 Planet', cls: 'btn-1' },
  { mode: '2 planet', label: '2 Planet', cls: 'btn-2' },
  { mode: '3 planet', label: '3 Planet', cls: 'btn-3' },
  { mode: 'legendary planet', label: 'Legendary', cls: 'btn-legendary' },
  { mode: 'empty', label: 'Empty', cls: 'btn-empty' },
  { mode: 'special', label: 'Special', cls: 'btn-special' },
  { mode: 'void', label: 'Void', cls: 'btn-void' },
  { mode: 'homesystem', label: 'Homesystem', cls: 'btn-homesystem' }
];

/**
 * List of effect types supported by the editor.
 */
export const effectModes = ['nebula', 'rift', 'asteroid', 'supernova'];

/**
 * Every wormhole type the bot knows, with display label, color and symbol.
 *
 * Keys are the bot's `WormholeModel.Wormhole` constants lowercased, in the same order,
 * and `symbol` is that enum's `symbol()` (except the rat race types, see below). Badges
 * draw the symbol rather than the label's initial: with 39 types the initials collide
 * (Pi, Phi, Psi and Probability are all "P").
 */
export const wormholeTypes = {
  alpha: { label: "Alpha", color: "orange", symbol: "α" },
  beta: { label: "Beta", color: "green", symbol: "β" },
  gamma: { label: "Gamma", color: "pink", symbol: "γ" },
  delta: { label: "Delta", color: "blue", symbol: "δ" },
  epsilon: { label: "Epsilon", color: "#b58900", symbol: "ε" },
  zeta: { label: "Zeta", color: "#800080", symbol: "ζ" },
  eta: { label: "Eta", color: "red", symbol: "η" },
  theta: { label: "Theta", color: "darkred", symbol: "θ" },
  iota: { label: "Iota", color: "#C71585", symbol: "ι" },
  kappa: { label: "Kappa", color: "darkgreen", symbol: "κ" },
  lambda: { label: "Lambda", color: "seagreen", symbol: "λ" },
  mu: { label: "Mu", color: "steelblue", symbol: "μ" },
  nu: { label: "Nu", color: "darkcyan", symbol: "ν" },
  xi: { label: "Xi", color: "olivedrab", symbol: "ξ" },
  omicron: { label: "Omicron", color: "indianred", symbol: "ο" },
  pi: { label: "Pi", color: "chocolate", symbol: "π" },
  rho: { label: "Rho", color: "darkorchid", symbol: "ρ" },
  sigma: { label: "Sigma", color: "dodgerblue", symbol: "σ" },
  tau: { label: "Tau", color: "darkgoldenrod", symbol: "τ" },
  upsilon: { label: "Upsilon", color: "slategray", symbol: "υ" },
  phi: { label: "Phi", color: "palevioletred", symbol: "φ" },
  chi: { label: "Chi", color: "darkolivegreen", symbol: "χ" },
  psi: { label: "Psi", color: "darkslateblue", symbol: "ψ" },
  omega: { label: "Omega", color: "navy", symbol: "ω" },
  narrows: { label: "Narrows", color: "slateblue", symbol: "N" },
  probability: { label: "Probability", color: "gray", symbol: "P" },
  champion: { label: "Champion", color: "saddlebrown", symbol: "C" },
  voyage: { label: "Voyage", color: "brown", symbol: "V" },
  vortex: { label: "Vortex", color: "indigo", symbol: "Vx" },
  // Rat race wormholes are types of their own that never link to the plain ones. The bot
  // gives them the plain symbol; here they carry an R so the two badges can be told apart.
  alpha_rat: { label: "Rat Alpha", color: "#8d6e63", symbol: "Rα" },
  beta_rat: { label: "Rat Beta", color: "#8d6e63", symbol: "Rβ" },
  gamma_rat: { label: "Rat Gamma", color: "#8d6e63", symbol: "Rγ" },
  delta_rat: { label: "Rat Delta", color: "#8d6e63", symbol: "Rδ" },
  epsilon_rat: { label: "Rat Epsilon", color: "#8d6e63", symbol: "Rε" },
  zeta_rat: { label: "Rat Zeta", color: "#8d6e63", symbol: "Rζ" },
  eta_rat: { label: "Rat Eta", color: "#8d6e63", symbol: "Rη" },
  theta_rat: { label: "Rat Theta", color: "#8d6e63", symbol: "Rθ" },
  iota_rat: { label: "Rat Iota", color: "#8d6e63", symbol: "Rι" },
  kappa_rat: { label: "Rat Kappa", color: "#8d6e63", symbol: "Rκ" }
};

/**
 * The bot's token id for a wormhole type (`Wormhole.tokenId()`): `wh` + type, or for a
 * rat race type `whrat` + its plain name. One-way tokens are named after it.
 *
 * @param {string} type  editor key, e.g. 'alpha' or 'alpha_rat'
 */
export function wormholeTokenId(type) {
  const key = String(type || '');
  return key.endsWith('_rat') ? `whrat${key.slice(0, -4)}` : `wh${key}`;
}

/**
 * Old spellings the bot still accepts for a wormhole (its `@JsonAlias`es), as prefixes:
 * `CUSTOM_ERONOUS_WHIOTA` is now `IOTA`, `WHNARROWS` is now `NARROWS`. Longest first.
 */
const LEGACY_WORMHOLE_PREFIXES = ['custom_eronous_wh', 'wh'];

/**
 * The editor's key for a wormhole as the data spells it: lowercased, with the bot's
 * legacy prefixes removed when what is left is a known type. An unknown type comes back
 * lowercased rather than dropped, so a wormhole added upstream still links to itself.
 * Returns '' for an empty value or the `'null'` string SystemInfo.json carries.
 *
 * A one-way key keeps its direction: 'ALPHA:IN' → 'alpha:in' (see wormholeKey).
 *
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeWormholeType(raw) {
  const key = String(raw ?? '').trim().toLowerCase();
  if (key === 'null') return '';
  const sep = key.lastIndexOf(':');
  if (sep > 0 && ONE_WAY_WORMHOLE_DIRS.includes(key.slice(sep + 1))) {
    const type = normalizeWormholeType(key.slice(0, sep));
    return type ? `${type}:${key.slice(sep + 1)}` : '';
  }
  if (!key || key in wormholeTypes) return key;
  for (const prefix of LEGACY_WORMHOLE_PREFIXES) {
    const rest = key.slice(prefix.length);
    if (key.startsWith(prefix) && rest in wormholeTypes) return rest;
  }
  return key;
}

/**
 * One-way wormholes: `in` is entry-only (a ship can leave its system through it, so a link
 * only ever starts there), `out` is exit-only (a link only ever ends there). They are the
 * bot's generated `<token>_in` / `<token>_out` tokens.
 */
export const ONE_WAY_WORMHOLE_DIRS = ['in', 'out'];

/**
 * The key a wormhole is stored under in a hex's wormhole sets: the type for an ordinary
 * wormhole, 'type:in' / 'type:out' for a one-way one. Keeping one-way wormholes in the same
 * sets means everything that copies a hex (undo, clipboard, swap, slices) carries them.
 *
 * @param {string} type
 * @param {'in'|'out'|null|undefined} [dir]
 */
export function wormholeKey(type, dir) {
  return ONE_WAY_WORMHOLE_DIRS.includes(/** @type {string} */ (dir)) ? `${type}:${dir}` : type;
}

/**
 * The type and direction of a stored wormhole key. `dir` is null for a two-way wormhole.
 *
 * @param {unknown} key
 * @returns {{type: string, dir: 'in'|'out'|null}}
 */
export function parseWormholeKey(key) {
  const norm = normalizeWormholeType(key);
  const sep = norm.lastIndexOf(':');
  if (sep > 0) return { type: norm.slice(0, sep), dir: /** @type {'in'|'out'} */ (norm.slice(sep + 1)) };
  return { type: norm, dir: null };
}

/**
 * Whether a link may start at (`departs`) or end at (`arrives`) a wormhole with this key.
 * Mirrors Tile.getDepartureWormholes / getArrivalWormholes: an exit-only wormhole is no
 * departure and an entry-only one no arrival.
 */
export function wormholeDeparts(key) {
  return parseWormholeKey(key).dir !== 'out';
}

export function wormholeArrives(key) {
  return parseWormholeKey(key).dir !== 'in';
}

/**
 * A wormhole key for reading: 'alpha', or 'alpha (IN)' / 'alpha (OUT)' for a one-way one.
 *
 * @param {unknown} key
 */
export function describeWormhole(key) {
  const { type, dir } = parseWormholeKey(key);
  return dir ? `${type} (${dir.toUpperCase()})` : type;
}

/**
 * Display props for a wormhole type, with a grey fallback for a type the editor has no
 * entry for yet.
 *
 * @param {unknown} type
 * @returns {{ label: string, color: string, symbol: string }}
 */
export function wormholeInfo(type) {
  const key = parseWormholeKey(type).type;
  const known = wormholeTypes[key];
  if (known) return known;
  const initial = key.charAt(0).toUpperCase() || '?';
  return { label: key ? initial + key.slice(1) : '?', color: 'gray', symbol: initial };
}


export const planetTypeColors = {
  HAZARDOUS: 'red',
  CULTURAL: 'blue',
  INDUSTRIAL: 'green',
};

export const techSpecialtyColors = {
  CYBERNETIC: '#FFD700', // yellow/gold
  BIOTIC: 'green',
  WARFARE: 'red',
  PROPULSION: '#00BFFF', // blue-ish (deep sky blue)
};

export const SVG_LAYER_ORDER = [
  // bottom-most visible (under all overlays)
  'wormholeLineLayer',      // bottom-most
  'planetTypeLayer',
  'resInfLayer',
  'idealRILayer',
  'realIDLabelLayer',
  'tileImageLayer',         // images
  // Map sectors tint whole regions, so they sit right over the tile images and under
  // every badge, icon and link drawn on top of a tile.
  'mapSectorLayer',
  // Above the tile images, which are opaque and used to hide drawn links entirely; below
  // the icon/token/lore layers, which are small centre-adjacent badges that a link
  // crossing the hex centre would otherwise obscure.
  'hyperlane-layer',        // user-drawn hyperlane links
  'wormholeIconLayer',      // <--- wormhole icons (NOT tokens!)
  'customAdjacencyLayer',
  'borderAnomalyLayer',
  'token-overlay-group',    // token indicators (separate from wormholes)
  'lore-link-layer',        // arcs from a lore entry to the tiles its effects act on
  'lore-overlay',           // lore markers sit above their own arcs
  'galaxyTitleLayer',       // each galaxy's name above its board
  // Transient "what will the next click do" cue for hyperlane drawing. Topmost on purpose:
  // it is only on screen mid-gesture, and it is useless if an overlay covers it.
  'hyperlane-indicator-layer',
  // The tile menu's "click an adjacent tile" step: the tile, its neighbours and the edge
  // under the pointer. Same reasoning — only up mid-step, and no use if covered.
  'tile-pick-layer',
  // A distance reading is the answer to a question you just asked, so nothing covers it.
  // Escape clears it.
  'distanceLayer'

  // top-most
];