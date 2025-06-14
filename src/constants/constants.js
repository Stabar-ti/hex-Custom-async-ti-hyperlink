// ─────────────── utils/constants.js ───────────────
export const MAX_MAP_RINGS = 15;

export const edgeDirections = [
  { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 },
  { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }
];

export const ringDirections = [
  { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
  { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }
];

export const controlPositions = ['pos-left', 'pos-top', 'pos-right'];

export const effectIconPositions = [
  { dx: -15, dy: -15 },
  { dx: 15, dy: -15 },
  { dx: -15, dy: 15 },
  { dx: 15, dy: 15 },
 // { dx: -25, dy: 25 }
];

export const effectEmojiMap = {
  nebula: '☁️',
  supernova: '☀️',
  asteroid: '🪨',
  rift: '🕳️',
  homesystem: '★'
};

 export const fallbackEffectEmoji = '?';

export const typeCodeMap = {
  '1 planet': '0b',
  '2 planet': '0b',
  '3 planet': '0b',
  'legendary planet':'0gray',
  'nebula': '0r',
  'asteroid': '0r',
  'rift': '0r',
  'special': '0r',
  'homesystem': '0g',
  'void': '-1',
  'empty': 'D118'
};

export const sectorColors = {
  '': '#eee',
  '1 planet': '#cce5ff',
  '2 planet': '#49a1ff',
  '3 planet': '#005cbf',
  'legendary planet': '#b300ff',
  'empty': 	'#fae7b5', // warm off-white
  'supernova': '#ffe5b4',
  'rift': '#7b7b7b',
  'nebula': '#e6ccff',
  'asteroid': '#d9d9d9',
  'special': '#ff83a0',
  'homesystem': '#059f00',
  'void': '#2b2b2b'
};

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

export const effectModes = ['nebula', 'rift', 'asteroid', 'supernova'];

export const wormholeTypes = {
  alpha:     { label: "Alpha",     color: "orange" },
  beta:      { label: "Beta",      color: "green" },
  gamma:     { label: "Gamma",     color: "pink" },
  delta:     { label: "Delta",     color: "blue" },
  eta:       { label: "Eta",       color: "red" },
  epsilon:   { label: "Epsilon",   color: "#b58900" },
  kappa:     { label: "Kappa",     color: "darkgreen" },
  zeta:      { label: "Zeta",      color: "#800080" },
  champion:  { label: "Champion",  color: "saddlebrown" },
  probability: { label: "Probability", color: "gray" },
  voyage:    { label: "Voyage",    color: "brown" },
  narrows:   { label: "Narrows",   color: "slateblue" }
};
