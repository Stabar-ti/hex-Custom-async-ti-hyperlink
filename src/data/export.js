// ───────────────────────────────────────────────────────────────
// Wormhole Handling Pattern (2024 Refactor):
//
// Each hex now has:
//   - inherentWormholes: wormholes from system/tile/realId (never exported/imported)
//   - customWormholes: user-placed wormholes (only these are exported/imported)
//   - wormholes: union of inherentWormholes and customWormholes (for overlays, UI, etc)
//
// All logic (import, export, overlays, undo, UI, distance calculations) must distinguish
// between inherent and custom wormholes. Only customWormholes are exported/imported.
//
// When mutating wormholes, always update customWormholes and call updateHexWormholes(hex)
// to refresh the union. This makes the codebase easier to maintain and debug.
// ───────────────────────────────────────────────────────────────

import { matrixToHex, hasLinks } from '../utils/matrix.js';
import { typeCodeMap } from '../constants/constants.js';
import { showModal } from '../ui/uiModals.js';
import { generateRings } from '../draw/drawHexes.js';
import { wormholeTypes } from '../constants/constants.js'; // Adjust import path if needed
import { getBorderAnomalyTypes } from '../constants/borderAnomalies.js';

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
 *
 * Only customWormholes are exported (see wormhole handling pattern above).
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
    if (!/^([0-9]{3,4}|TL|TR|BL|BR)$/.test(id)) continue;
    // Debug: log wormhole state before export
    console.log('exportWormholePositions', id, {
      inherentWormholes: Array.from(hex.inherentWormholes || []),
      customWormholes: Array.from(hex.customWormholes || []),
      wormholes: Array.from(hex.wormholes || [])
    });
    // Only export customWormholes
    const userWormholes = Array.from(hex.customWormholes || []);
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
 * Exports the full editor state as a compact JSON object (for saving/loading).
 * Only non-empty fields are exported, and property names are shortened for compactness.
 *
 * Field mapping:
 *   id: label
 *   rid: realId
 *   q, r: coordinates
 *   pl: planets
 *   bt: baseType
 *   fx: effects
 *   wh: customWormholes
 *   ca: customAdjacents
 *   ao: adjacencyOverrides
 *   ba: borderAnomalies
 *   ln: links (matrix)
 */
export function exportFullState(editor) {
  const hexes = Object.entries(editor.hexes).map(([label, hex]) => {
    const h = { id: label };
    if (hex.realId != null && hex.realId !== '') h.rid = hex.realId.toString();
    if (typeof hex.q === 'number') h.q = hex.q;
    if (typeof hex.r === 'number') h.r = hex.r;
    if (hex.planets && hex.planets.length) h.pl = Array.from(hex.planets);
    if (hex.baseType && hex.baseType !== '') h.bt = hex.baseType;
    if (hex.effects && hex.effects.size) h.fx = Array.from(hex.effects);
    if (hex.customWormholes && hex.customWormholes.size) h.wh = Array.from(hex.customWormholes);
    if (hex.customAdjacents && Object.keys(hex.customAdjacents).length) h.ca = JSON.parse(JSON.stringify(hex.customAdjacents));
    if (hex.adjacencyOverrides && Object.keys(hex.adjacencyOverrides).length) h.ao = JSON.parse(JSON.stringify(hex.adjacencyOverrides));
    if (hex.borderAnomalies && Object.keys(hex.borderAnomalies).length) h.ba = JSON.parse(JSON.stringify(hex.borderAnomalies));
    if (hex.matrix && hex.matrix.flat().some(x => x !== 0)) h.ln = hex.matrix;
    return h;
  });
  return JSON.stringify({ hexes }, null, 1);
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
        // If this hex has a realId AND is a hyperlane tile, export its realId (string)
        if (hex.realId != null && hex.realId !== '') {
          // Optional: If you want to guarantee lowercase or match key, add .toLowerCase()
          return hex.realId.toString();
        }
        // Fallback: legacy, unknown/anonymous hyperlane
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
  const oneWayMap = {};
  const twoWayMap = {};

  Object.entries(editor.hexes).forEach(([label, hex]) => {
    if (!hex.customAdjacents) return;
    Object.entries(hex.customAdjacents).forEach(([target, info]) => {
      const tileA = Number(label), tileB = Number(target);
      const key = [Math.min(tileA, tileB), Math.max(tileA, tileB)].join('-');
      if (info.twoWay) {
        if (tileA > tileB || handled.has(key)) return; // Only emit from lower label
        handled.add(key);
        // Group two-way by label
        if (!twoWayMap[label]) twoWayMap[label] = new Set();
        twoWayMap[label].add(target);
      } else {
        // One-way: group by label
        if (!oneWayMap[label]) oneWayMap[label] = new Set();
        oneWayMap[label].add(target);
      }
    });
  });

  // Emit two-way grouped lines
  Object.entries(twoWayMap).forEach(([label, targets]) => {
    lines.push(`/map add_custom_adjacent_tiles primary_tile: ${label} adjacent_tiles: ${Array.from(targets).join(',')} two_way: true`);
  });
  // Emit one-way grouped lines
  Object.entries(oneWayMap).forEach(([label, targets]) => {
    lines.push(`/map add_custom_adjacent_tiles primary_tile: ${label} adjacent_tiles: ${Array.from(targets).join(',')} two_way: false`);
  });

  return lines.join('\n');
}

/**
 * Exports the full map state in a format similar to test.json structure
 * Returns an object with mapInfo array containing full hex information
 */
export function exportMapInfo(editor) {
  const mapInfo = [];

  Object.entries(editor.hexes).forEach(([label, hex]) => {
    if (!hex || !hex.center) return; // Skip uninitialized hexes

    // Build planets array
    const planets = (hex.planets || []).map(planet => {
      // Build planet lore from flavourText or existing lore fields
      let planetLore = [];
      if (planet.loreMain || planet.loreSub || planet.flavourText) {
        if (planet.loreMain) planetLore.push(planet.loreMain);
        else if (planet.loreSub) planetLore.push(planet.loreSub);
        //else if (planet.flavourText) planetLore.push(planet.flavourText);

        // Add space/planet indicator if available
        if (planet.spaceOrPlanet) {
          planetLore.push(planet.spaceOrPlanet === 'space' ? 'Space' : 'Planet');
        } //else if (planet.planetType) {
        //planetLore.push('Planet'); // Default to planet if planetType exists
        //}
      }

      return {
        planetID: planet.id || planet.planetID || '',
        attachments: planet.attachments || [],
        planetLore: planetLore
      };
    });

    // Build tokens array - collect from various token sources
    const tokens = [];
    if (hex.tokens) {
      tokens.push(...hex.tokens);
    }

    // Add custom wormholes as tokens using the same mapping as exportWormholePositions
    if (hex.customWormholes && hex.customWormholes.size > 0) {
      const whTokenMap = {};
      Object.keys(wormholeTypes).forEach(
        key => whTokenMap[key] = 'wh' + key
      );
      whTokenMap.iota = 'custom_eronous_whiota';
      whTokenMap.theta = 'custom_eronous_whtheta';

      const userWormholes = Array.from(hex.customWormholes);
      for (const whRaw of userWormholes) {
        // Normalize to base key, strip any wh prefix
        const whKey = whRaw.toLowerCase().replace(/^wh/, '');
        const whToken = whTokenMap[whKey] || ('wh' + whKey);
        tokens.push(whToken);
      }
    }

    // Build hyperlane string (matrix to comma-separated format)
    let hyperlaneString = '';
    if (hex.matrix) {
      // Convert 6x6 matrix to comma-separated format with semicolons between rows
      const rows = [];
      for (let row = 0; row < 6; row++) {
        const rowValues = [];
        for (let col = 0; col < 6; col++) {
          rowValues.push((hex.matrix[row] && hex.matrix[row][col]) ? '1' : '0');
        }
        rows.push(rowValues.join(','));
      }
      hyperlaneString = rows.join(';');
    } else {
      hyperlaneString = '0,0,0,0,0,0;0,0,0,0,0,0;0,0,0,0,0,0;0,0,0,0,0,0;0,0,0,0,0,0;0,0,0,0,0,0'; // Default empty hyperlanes
    }

    // If hyperlane string is all zeros, leave it empty
    if (hyperlaneString === '0,0,0,0,0,0;0,0,0,0,0,0;0,0,0,0,0,0;0,0,0,0,0,0;0,0,0,0,0,0;0,0,0,0,0,0') {
      hyperlaneString = '';
    }

    // Build border anomalies array (objects with direction and type)
    const borderAnomalies = [];
    if (hex.borderAnomalies) {
      Object.entries(hex.borderAnomalies).forEach(([sideStr, anomaly]) => {
        const side = parseInt(sideStr, 10);
        if (side >= 0 && side < 6 && anomaly.type) {
          borderAnomalies.push({
            direction: side, // Use 0-5 instead of 1-6
            type: anomaly.type.replace(/\s+/g, '') // Remove spaces for consistency
          });
        }
      });
    }

    // Build system lore array - process both main/sub parts and general lore
    let systemLore = [];
    if (hex.loreMain || hex.loreSub || hex.lore) {
      if (hex.loreMain) systemLore.push(hex.loreMain);
      if (hex.loreSub) systemLore.push(hex.loreSub);
      else if (hex.lore) {
        if (Array.isArray(hex.lore)) {
          systemLore.push(...hex.lore);
        } else if (typeof hex.lore === 'string') {
          systemLore.push(...hex.lore.split(',').map(s => s.trim()));
        }
      }

      // Add space indicator for system-level lore
      if (hex.spaceOrPlanet) {
        systemLore.push(hex.spaceOrPlanet === 'space' ? 'Space' : 'Planet');
      } else {
        systemLore.push('Space'); // Default to space for system-level
      }
    }

    // Build simplified custom adjacencies array
    const customAdjacencies = [];
    if (hex.customAdjacents) {
      Object.entries(hex.customAdjacents).forEach(([target, info]) => {
        // Just add the target - two-way connections are already stored on both hexes
        customAdjacencies.push(target);
      });
    }

    // Build adjacency overrides array
    const adjacencyOverrides = [];
    if (hex.adjacencyOverrides) {
      Object.entries(hex.adjacencyOverrides).forEach(([sideStr, neighborLabel]) => {
        const side = parseInt(sideStr, 10);
        if (side >= 0 && side < 6 && neighborLabel) {
          adjacencyOverrides.push({
            secondary: neighborLabel,
            direction: side // Use 0-5 instead of binary string
          });
        }
      });
    }

    // Create hex entry
    const hexEntry = {
      position: label,
      tileID: hyperlaneString ? 'hl' : (hex.realId || hex.systemId || ''),
      planets: planets,
      tokens: tokens,
      customHyperlaneString: hyperlaneString,
      borderAnomalies: borderAnomalies,
      systemLore: systemLore,
      Plastic: hex.plastic || null,
      customAdjacencies: customAdjacencies,
      adjacencyOverrides: adjacencyOverrides
    };

      // Only add hexEntry if at least one subfield is non-empty/non-trivial
      const hasInfo = (
        (planets && planets.length > 0) ||
        (tokens && tokens.length > 0) ||
        (hyperlaneString && hyperlaneString !== '') ||
        (borderAnomalies && borderAnomalies.length > 0) ||
        (systemLore && systemLore.length > 0) ||
        (hex.plastic != null && hex.plastic !== '') ||
        (customAdjacencies && customAdjacencies.length > 0) ||
        (adjacencyOverrides && adjacencyOverrides.length > 0)
      );
      if (hasInfo) {
        mapInfo.push(hexEntry);
      }
  });

  return { mapInfo };
}

//test

export function exportBorderAnomaliesGrouped(editor, doubleSided = true) {
  const dirMap = ['n', 'ne', 'se', 's', 'sw', 'nw'];
  const reverseDir = [3, 4, 5, 0, 1, 2];
  const groups = {};

  Object.entries(editor.hexes).forEach(([label, hex]) => {
    if (!hex.borderAnomalies) return;
    Object.entries(hex.borderAnomalies).forEach(([sideStr, anomaly]) => {
      const side = parseInt(sideStr, 10);
      const dir = dirMap[side];
      let type = (anomaly.type || '').replace(/\s+/g, '');
      if (!dir || !type) return;

      const neighborLabel = getNeighborHexLabel(editor.hexes, label, side);
      const neighborSide = reverseDir[side];

      // Get border anomaly configuration
      const borderTypes = getBorderAnomalyTypes();
      const typeId = type.toUpperCase().replace(/\s+/g, '');
      const anomalyConfig = borderTypes[typeId];
      
      const key = `${dir}_${type}`;
      if (!groups[key]) groups[key] = new Set();
      groups[key].add(label);
      
      // Add to neighbor if bidirectional
      if (anomalyConfig && anomalyConfig.bidirectional && neighborLabel) {
        const neighborDir = dirMap[neighborSide];
        const neighborKey = `${neighborDir}_${type}`;
        if (!groups[neighborKey]) groups[neighborKey] = new Set();
        groups[neighborKey].add(neighborLabel);
      } else if (!anomalyConfig && doubleSided && neighborLabel) {
        // Fallback for unknown types
        const neighborDir = dirMap[neighborSide];
        const neighborKey = `${neighborDir}_${type}`;
        if (!groups[neighborKey]) groups[neighborKey] = new Set();
        groups[neighborKey].add(neighborLabel);
      }
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
