// ───────────────────────────────────────────────────────────────
// data/export.js
//
// This module provides all export utilities for the TI4 map editor.
// It supports exporting map data in multiple formats:
// - Adjacency strings for hyperlane links
// - User-added wormhole positions (for scripting bots, etc)
// - Hyperlane tile positions
// - Full JSON state for saving/sharing maps
// - Sector code (type) string for re-import or sharing
// Each format is designed to support both advanced automation
// and human sharing/copy-paste workflows.
// ───────────────────────────────────────────────────────────────

import { matrixToHex, hasLinks } from '../utils/matrix.js';
import { typeCodeMap } from '../constants/constants.js';
import { showModal } from '../ui/uiModals.js';
import { generateRings } from '../draw/drawHexes.js';
import { wormholeTypes } from '../constants/constants.js'; // Adjust import path if needed

/**
 * Exports all hyperlane (adjacency) data as a string, showing only hexes with links.
 * Ensures that all links are symmetric/bidirectional in the matrix.
 * Output is written to the export text area and shown in a modal.
 */
export function exportMap(editor) {
  const out = [];

  for (const id in editor.hexes) {
    const hex = editor.hexes[id];
    if (!hex.matrix) continue;

    // Clone matrix for mutation
    const matrix = hex.matrix.map(r => [...r]);

    // Mirror all links to make bidirectional (symmetric)
    editor.edgeDirections.forEach((dir, entry) => {
      matrix[entry].forEach((val, exit) => {
        if (val === 1) {
          const nbrQ = hex.q + editor.edgeDirections[exit].q;
          const nbrR = hex.r + editor.edgeDirections[exit].r;
          const nbr = Object.values(editor.hexes).find(h => h.q === nbrQ && h.r === nbrR);
          if (nbr) {
            const rev = editor.edgeDirections.findIndex(d => d.q === -dir.q && d.r === -dir.r);
            if (rev >= 0) matrix[exit][entry] = 1;
          }
        }
      });
    });

    if (!hasLinks(matrix)) continue; // Only export hexes with links

    const hexStr = matrixToHex(matrix);
    out.push(`${id},${hexStr}`);
  }

  document.getElementById('exportText').value = out.join(' ');
  showModal('exportModal');
}

/**
 * Exports only user-added wormhole tokens/positions.
 * Omits inherent/system wormholes (from tile data).
 * Output is compatible with TTS/bot /add_token syntax.
 */
export function exportWormholePositions(editor) {
  // Build the wormhole token map
  const whTokenMap = {};
  Object.keys(wormholeTypes).forEach(
    key => whTokenMap[key] = 'wh' + key
  );
  whTokenMap.iota = 'custom_eronous_whiota';
  whTokenMap.theta = 'custom_eronous_whtheta';

  const groups = {};

  for (const [id, hex] of Object.entries(editor.hexes)) {
    if (!/^\d{3,4}$/.test(id)) continue;

    // Find inherent/system wormholes (lowercase)
    const inherent = new Set(
      Array.from(hex.inherentWormholes || hex.systemWormholes || [])
        .map(w => w.toLowerCase())
    );

    // User wormholes: in .wormholes but not inherent
    const userWormholes = Array.from(hex.wormholes || []).filter(
      w => !inherent.has(w.toLowerCase())
    );

    if (userWormholes.length === 0) continue;

    for (const whRaw of userWormholes) {
      // Normalize to base key, strip any wh prefix
      const whKey = whRaw.toLowerCase().replace(/^wh/, '');
      const whToken = whTokenMap[whKey] || ('wh' + whKey);

      if (!groups[whToken]) groups[whToken] = [];
      groups[whToken].push(id);
    }
  }

  const lines = Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([whToken, ids]) =>
      `/add_token token:${whToken} tile_name:${ids.sort((a, b) => +a - +b).join(',')}`
    );

  const output = lines.join('\n');
  const textarea = document.getElementById('exportWormholePositionsText');
  if (textarea) textarea.value = output;
  showModal('exportWormholePositionsModal');
}

/**
 * Exports IDs of all tiles with hyperlane links.
 * Output is compatible with scripting (e.g. /map add_tile ...).
 */
export function exportHyperlaneTilePositions(editor) {
  const ids = Object.entries(editor.hexes)
    .filter(([_, h]) => h.matrix?.flat().some(x => x === 1))
    .map(([id]) => id)
    .sort((a, b) => {
      const [ra, ia] = [+a[0], +a.slice(1)];
      const [rb, ib] = [+b[0], +b.slice(1)];
      return ra === rb ? ia - ib : ra - rb;
    });

  const out = `/map add_tile tile_name: hl position: ${ids.join(',')}`;
  document.getElementById('exportHyperlanePositionsText').value = out;
  showModal('exportHyperlanePositionsModal');
}

/**
 * Exports the full editor state as a JSON object (for saving/loading).
 * Includes only user-added wormholes (not inherent/system).
 */
export function exportFullState(editor) {
  const hexes = Object.entries(editor.hexes).map(([label, hex]) => {
    const inherent = hex.inherentWormholes || new Set();
    const userWormholes = Array.from(hex.wormholes || [])
      .filter(w => !inherent.has(w));

    return {
      id: label,
      realId: hex.realId != null ? hex.realId.toString() : '',
      q: hex.q,
      r: hex.r,
      planets: Array.from(hex.planets || []),
      baseType: hex.baseType || '',
      effects: Array.from(hex.effects || []),
      wormholes: userWormholes,
      customAdjacents: hex.customAdjacents ? JSON.parse(JSON.stringify(hex.customAdjacents)) : undefined,
      adjacencyOverrides: hex.adjacencyOverrides ? JSON.parse(JSON.stringify(hex.adjacencyOverrides)) : undefined,
      borderAnomalies: hex.borderAnomalies ? JSON.parse(JSON.stringify(hex.borderAnomalies)) : undefined,
      links: hex.matrix,

    };
  });

  return JSON.stringify({ hexes }, null, 2);
}

/**
 * Builds the sector-type code string for export.
 * Each hex's realId is exported if available, otherwise falls back to type codes.
 * Only includes up to the last "significant" hex with a non-empty type or hyperlane.
 */
function parseLabel(id) {
  if (id === '000') return [0, 0];
  const len = id.length;
  const ring = +id.slice(0, len - 2);
  const idx = +id.slice(len - 2);
  return [ring, idx];
}


export function exportSectorTypes(editor) {
  const getCode = (hex) => {
    if (!hex) return '-1';

    // If void type, always -1
    if (hex.baseType === 'void') return '-1';

    // Hyperlane detection: nonzero matrix links
    if (hex.matrix) {
      const flat = hex.matrix.flat();
      const allZero = flat.every(v => v === 0);
      if (!allZero && flat.includes(1)) {
        return 'HL';
      }
    }

    // Use realId if present
    if (hex.realId != null && hex.realId !== '') return hex.realId.toString();

    // Try typeCodeMap
    if (hex.baseType && typeCodeMap[hex.baseType]) return typeCodeMap[hex.baseType];

    // Fallback for any baseType that hints at hyperlane
    if (hex.baseType && hex.baseType.toLowerCase().includes('hyperlane')) return 'HL';

    return '-1';
  };

  // --- Determine maximum ring (from actual map size, or user setting)
  const hexLabels = Object.keys(editor.hexes).filter(l => /^\d{3,4}$/.test(l));
  let maxRing = 0;
  for (const l of hexLabels) {
    if (l === '000') continue;
    const ring = +l.slice(0, l.length - 2);
    if (ring > maxRing) maxRing = ring;
  }

  // Build label list: always include '000' and full rings
  let labelList = ['000'];
  for (let ring = 1; ring <= maxRing; ring++) {
    const maxIdx = 6 * ring;
    for (let idx = 1; idx <= maxIdx; idx++) {
      const label = `${ring}${String(idx).padStart(2, '0')}`;
      labelList.push(label);
    }
  }

  // Map to sector codes
  const codeList = labelList.map(label => getCode(editor.hexes[label]));

  return `{${codeList[0]}} ${codeList.slice(1).join(' ')}`;
}



export function exportAdjacencyOverrides(editor) {
  // Map side index to text label
  const dirMap = ['n', 'ne', 'se', 's', 'sw', 'nw'];
  const seenPairs = new Set();
  let overrides = [];

  Object.entries(editor.hexes).forEach(([label, hex]) => {
    if (!hex.adjacencyOverrides) return;
    Object.entries(hex.adjacencyOverrides).forEach(([sideStr, neighborLabel]) => {
      const side = parseInt(sideStr, 10);
      if (!dirMap[side] || !neighborLabel) return;
      // Build a normalized unique key for this connection
      const [a, aSide, b] = [label, side, neighborLabel];
      const [bSide] = [(side + 3) % 6];
      // Sort labels to always use the lower label first for the key
      const key = (a < b)
        ? `${a}-${aSide}-${b}-${bSide}`
        : `${b}-${bSide}-${a}-${aSide}`;
      if (seenPairs.has(key)) return;
      seenPairs.add(key);

      // Always export as a:side:b (original direction)
      if (a < b) {
        overrides.push(`${a}:${dirMap[aSide]}:${b}`);
      } else {
        overrides.push(`${b}:${dirMap[bSide]}:${a}`);
      }
    });
  });

  if (!overrides.length) return 'No adjacency overrides set.';
  return `/map add_adjacency_override_list adjacency_list: ${overrides.join(' ')}`;
}


/**
 * Returns multiple lines like:
 * /map add_custom_adjacent_tiles primary_tile: 317 adjacent_tiles: 529,209 two_way: false
 * (2-way links are only listed for the lower tile number)
 */
export function exportCustomAdjacents(editor) {
  const lines = [];
  const handled = new Set();

  Object.entries(editor.hexes).forEach(([label, hex]) => {
    if (!hex.customAdjacents) return;
    Object.entries(hex.customAdjacents).forEach(([target, info]) => {
      // Only output if:
      // - One-way (always output from "from" tile)
      // - Two-way and label < target (to avoid double-listing)
      const tileA = Number(label), tileB = Number(target);
      const key = [Math.min(tileA, tileB), Math.max(tileA, tileB)].join('-');
      if (info.twoWay) {
        if (tileA > tileB || handled.has(key)) return; // Only emit from lower label
        handled.add(key);
      }
      // Output this custom adjacency
      lines.push(`/map add_custom_adjacent_tiles primary_tile: ${label} adjacent_tiles: ${target} two_way: ${info.twoWay}`);
    });
  });

  return lines.join('\n');
}

export function exportBorderAnomaliesGrouped(editor) {
  const dirMap = ['n', 'ne', 'se', 's', 'sw', 'nw'];
  const groups = {};

  Object.entries(editor.hexes).forEach(([label, hex]) => {
    if (!hex.borderAnomalies) return;
    Object.entries(hex.borderAnomalies).forEach(([sideStr, anomaly]) => {
      const side = parseInt(sideStr, 10);
      const dir = dirMap[side];
      let type = (anomaly.type || '').replace(/\s+/g, '');
      if (!dir || !type) return;

      // Get neighbor LABEL for the direction
      const neighborLabel = getNeighborHexLabel(editor.hexes, label, side);

      // For SpatialTear, only export for the LOWER label
      if (type === "SpatialTear" && neighborLabel && label > neighborLabel) return;

      const key = `${dir}_${type}`;
      if (!groups[key]) groups[key] = new Set();
      groups[key].add(label);
    });
  });

  const commands = [];
  Object.entries(groups).forEach(([key, tiles]) => {
    const [dir, type] = key.split('_');
    commands.push(
      `/map add_border_anomaly primary_tile: ${Array.from(tiles).join(',')} primary_tile_direction: ${dir} border_anomaly_type: ${type}`
    );
  });

  return commands.length ? commands.join('\n') : "No border anomalies set.";
}

// The new helper:
function getNeighborHexLabel(hexes, label, side) {
  const dirs = [
    { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 },
    { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }
  ];
  const hex = hexes[label];
  if (!hex) return null;
  const { q, r } = hex;
  const nq = q + dirs[side].q, nr = r + dirs[side].r;
  for (const [neighborLabel, neighborHex] of Object.entries(hexes)) {
    if (neighborHex.q === nq && neighborHex.r === nr) return neighborLabel;
  }
  return null;
}
