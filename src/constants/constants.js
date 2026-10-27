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
 * and `symbol` is that enum's `symbol()`. Badges draw the symbol rather than the label's
 * initial: with 29 types the initials collide (Pi, Phi, Psi and Probability are all "P").
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
  vortex: { label: "Vortex", color: "indigo", symbol: "Vx" }
};

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
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeWormholeType(raw) {
  const key = String(raw ?? '').trim().toLowerCase();
  if (key === 'null') return '';
  if (!key || key in wormholeTypes) return key;
  for (const prefix of LEGACY_WORMHOLE_PREFIXES) {
    const rest = key.slice(prefix.length);
    if (key.startsWith(prefix) && rest in wormholeTypes) return rest;
  }
  return key;
}

/**
 * Display props for a wormhole type, with a grey fallback for a type the editor has no
 * entry for yet.
 *
 * @param {unknown} type
 * @returns {{ label: string, color: string, symbol: string }}
 */
export function wormholeInfo(type) {
  const key = normalizeWormholeType(type);
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