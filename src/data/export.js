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
 * Cache for wormhole token mappings loaded from tokens.json
 */
let wormholeTokenMapCache = null;

/**
 * Load wormhole token mappings dynamically from tokens.json
 * Maps wormhole type keys (lowercase, e.g., 'alpha', 'epsilon') to token IDs
 * @returns {Promise<Object>} Map of wormhole type to token ID
 */
async function getWormholeTokenMap() {
  if (wormholeTokenMapCache) return wormholeTokenMapCache;

  try {
    const basePath = window.location.pathname.endsWith('/')
      ? window.location.pathname
      : window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);

    const response = await fetch(`${basePath}public/data/tokens.json`);
    if (!response.ok) throw new Error(`Failed to load tokens.json: ${response.status}`);

    // tokens.json is an array of arrays, flatten it
    const tokenGroups = await response.json();
    const allTokens = tokenGroups.flat();

    const map = {};

    // Build a map of wormhole type to token ID
    // For each token, check if it has wormholes field
    allTokens.forEach(token => {
      if (token.wormholes && token.wormholes.length > 0) {
        token.wormholes.forEach(whType => {
          // Normalize wormhole type to lowercase (e.g., "ALPHA" -> "alpha")
          const whKey = whType.toLowerCase()
            .replace('custom_eronous_wh', '') // Remove custom_eronous_wh prefix
            .replace('wh', ''); // Remove wh prefix if present

          // Only set if not already set, or if this is a shorter/preferred token ID
          if (!map[whKey] || token.id.length < map[whKey].length) {
            map[whKey] = token.id;
          }
        });
      }
    });

    console.log('Loaded wormhole token map from tokens.json:', map);
    wormholeTokenMapCache = map;
    return map;
  } catch (error) {
    console.error('Failed to load wormhole token map, using fallback:', error);
    // Fallback to basic mapping
    return {
      'alpha': 'whalpha',
      'beta': 'whbeta',
      'gamma': 'whgamma',
      'delta': 'whdelta',
      'epsilon': 'whepsilon',
      'eta': 'wheta',
      'iota': 'custom_eronous_whiota',
      'theta': 'custom_eronous_whtheta',
      'zeta': 'whzeta',
      'kappa': 'whkappa',
      'champion': 'whchampion',
      'probability': 'whprobability',
      'voyage': 'whvoyage',
      'narrows': 'whnarrows',
      'vortex': 'vortex'
    };
  }
}

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
export async function exportWormholePositions(editor) {
  // Load wormhole token map dynamically from tokens.json
  const whTokenMap = await getWormholeTokenMap();
  console.log('exportWormholePositions: Token map loaded:', whTokenMap);

  const groups = {};

  for (const [id, hex] of Object.entries(editor.hexes)) {
    if (!/^([0-9]{3,4}|TL|TR|BL|BR)$/.test(id)) continue;

    // Only export customWormholes
    const userWormholes = Array.from(hex.customWormholes || []);
    if (userWormholes.length === 0) continue;

    for (const whRaw of userWormholes) {
      // Normalize to lowercase and find token ID from map
      const whKey = whRaw.toLowerCase();
      const whToken = whTokenMap[whKey];

      if (!whToken) {
        console.warn(`No token mapping found for wormhole type: ${whRaw}`);
        continue;
      }

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
    
    // Add system lore if it exists
    if (hex.systemLore) {
      h.sl = {
        lt: hex.systemLore.loreText || "",
        ft: hex.systemLore.footerText || "",
        r: hex.systemLore.receiver || "CURRENT",
        t: hex.systemLore.trigger || "CONTROLLED",
        p: hex.systemLore.ping || "NO",
        pe: hex.systemLore.persistance || "ONCE"
      };
    }
    
    // Add planet lore if it exists
    if (hex.planetLore && Object.keys(hex.planetLore).length > 0) {
      h.prl = {};
      Object.entries(hex.planetLore).forEach(([planetIndex, lore]) => {
        if (lore) {
          h.prl[planetIndex] = {
            lt: lore.loreText || "",
            ft: lore.footerText || "",
            r: lore.receiver || "CURRENT",
            t: lore.trigger || "CONTROLLED",
            p: lore.ping || "NO",
            pe: lore.persistance || "ONCE"
          };
        }
      });
    }
    
    // Add system tokens if they exist
    if (hex.systemTokens && hex.systemTokens.length > 0) {
      h.st = hex.systemTokens;
    }
    
    // Add planet tokens if they exist
    if (hex.planetTokens && Object.keys(hex.planetTokens).length > 0) {
      h.pt = {};
      Object.entries(hex.planetTokens).forEach(([planetIndex, tokens]) => {
        if (tokens && tokens.length > 0) {
          h.pt[planetIndex] = tokens;
        }
      });
    }
    
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
export async function exportMapInfo(editor) {
  // Load wormhole token map dynamically from tokens.json
  const whTokenMap = await getWormholeTokenMap();
  console.log('exportMapInfo: Token map loaded:', whTokenMap);

  const mapInfo = [];

  Object.entries(editor.hexes).forEach(([label, hex]) => {
    if (!hex || !hex.center) return; // Skip uninitialized hexes

    // Build planets array
    const planets = (hex.planets || []).map((planet, planetIndex) => {
      // Build planet lore from new lore module structure
      let planetLore = null;
      if (hex.planetLore && hex.planetLore[planetIndex]) {
        const lore = hex.planetLore[planetIndex];
        planetLore = {
          loreText: lore.loreText || "",
          footerText: lore.footerText || "",
          receiver: lore.receiver || "CURRENT",
          trigger: lore.trigger || "CONTROLLED",
          ping: lore.ping || "NO",
          persistance: lore.persistance || "ONCE"
        };
      } else if (planet.loreMain || planet.loreSub || planet.flavourText) {
        // Legacy fallback - convert old planet lore format
        let loreText = "";
        if (planet.loreMain) loreText = planet.loreMain;
        else if (planet.loreSub) loreText = planet.loreSub;
        else if (planet.flavourText) loreText = planet.flavourText;
        
        if (loreText) {
          planetLore = {
            loreText: loreText,
            footerText: "",
            receiver: "CURRENT",
            trigger: "CONTROLLED",
            ping: "NO",
            persistance: "ONCE"
          };
        }
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

    // Add custom wormholes as tokens using dynamic token map
    if (hex.customWormholes && hex.customWormholes.size > 0) {
      const userWormholes = Array.from(hex.customWormholes);
      for (const whRaw of userWormholes) {
        // Normalize to lowercase and find token ID from map
        const whKey = whRaw.toLowerCase();
        const whToken = whTokenMap[whKey];

        if (whToken) {
          tokens.push(whToken);
        } else {
          console.warn(`No token mapping found for wormhole type: ${whRaw}`);
        }
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
            type: anomaly.type // Use the ID directly (e.g., "ASTEROID", not "Asteroid Field")
          });
        }
      });
    }

    // Build system lore - use new lore module structure
    let systemLore = null;
    if (hex.systemLore) {
      // Use the structured lore object from the lore module
      systemLore = {
        loreText: hex.systemLore.loreText || "",
        footerText: hex.systemLore.footerText || "",
        receiver: hex.systemLore.receiver || "CURRENT",
        trigger: hex.systemLore.trigger || "CONTROLLED",
        ping: hex.systemLore.ping || "NO",
        persistance: hex.systemLore.persistance || "ONCE"
      };
    } else if (hex.loreMain || hex.loreSub || hex.lore) {
      // Legacy fallback - convert old lore format to new structure
      let loreText = "";
      if (hex.loreMain) loreText = hex.loreMain;
      else if (hex.loreSub) loreText = hex.loreSub;
      else if (hex.lore) {
        if (Array.isArray(hex.lore)) {
          loreText = hex.lore.join(" ");
        } else if (typeof hex.lore === 'string') {
          loreText = hex.lore;
        }
      }
      
      if (loreText) {
        systemLore = {
          loreText: loreText,
          footerText: "",
          receiver: "CURRENT",
          trigger: "CONTROLLED", 
          ping: "NO",
          persistance: "ONCE"
        };
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
    // Determine tileID based on baseType and other conditions
    let tileID = '';
    if (hyperlaneString) {
      // If there are hyperlanes, use 'hl'
      tileID = 'hl';
      //} else if (hex.baseType === 'void') {
      //  // Void tiles get -1
      //  tileID = '-1';
    } else if (hex.baseType === 'homesystem') {
      // Home system tiles get 0g
      tileID = '0g';
      console.log(`exportMapInfo: Setting tileID to '0g' for ${label}, baseType: ${hex.baseType}`);
    } else {
      // Otherwise use realId or systemId
      tileID = hex.realId || hex.systemId || '';
    }

    const hexEntry = {
      position: label,
      tileID: tileID,
      planets: planets,
      tokens: tokens,
      customHyperlaneString: hyperlaneString,
      borderAnomalies: borderAnomalies,
      systemLore: systemLore,
      Plastic: hex.plastic || null,
      customAdjacencies: customAdjacencies,
      adjacencyOverrides: adjacencyOverrides
    };

    // Only add hexEntry if tileID is assigned (required field)
    // If there's no tileID, omit the entire position even if there's other data
    if (tileID && tileID !== '') {
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
