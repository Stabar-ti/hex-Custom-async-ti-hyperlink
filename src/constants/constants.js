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
 * The 6 edge directions for moving on a hex grid (axial coordinates).
 * Used for pathfinding, neighbor logic, etc.
 */
export const edgeDirections = [
  { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 },
  { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }
];

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
  'homesystem': '#059f00',
  'void': '#2b2b2b'
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
 * Mapping of all supported wormhole types, with display label and color.
 */
export const wormholeTypes = {
  alpha: { label: "Alpha", color: "orange" },
  beta: { label: "Beta", color: "green" },
  gamma: { label: "Gamma", color: "pink" },
  delta: { label: "Delta", color: "blue" },
  eta: { label: "Eta", color: "red" },
  epsilon: { label: "Epsilon", color: "#b58900" },
  kappa: { label: "Kappa", color: "darkgreen" },
  zeta: { label: "Zeta", color: "#800080" },
  champion: { label: "Champion", color: "saddlebrown" },
  probability: { label: "Probability", color: "gray" },
  voyage: { label: "Voyage", color: "brown" },
  narrows: { label: "Narrows", color: "slateblue" },
  iota: { label: "Iota", color: "#C71585" },
  theta: { label: "Theta", color: "darkred" }
};


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