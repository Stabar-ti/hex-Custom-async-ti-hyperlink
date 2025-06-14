
// ─────────────── data/export.js ───────────────
import { matrixToHex, hasLinks } from '../utils/matrix.js';
import { typeCodeMap } from '../constants/constants.js'; 
import { showModal } from '../ui/uiModals.js';

export function exportMap(editor) {
  const out = [];

  for (const id in editor.hexes) {
    const hex = editor.hexes[id];
    if (!hex.matrix) continue;

    // Mirror connections for symmetry
    const matrix = hex.matrix.map(r => [...r]);

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

    if (!hasLinks(matrix)) continue;

    const hexStr = matrixToHex(matrix);
    out.push(`${id},${hexStr}`);
  }

  document.getElementById('exportText').value = out.join(' ');
  showModal('exportModal');
}

/**
 * Exports only user-added wormhole positions, omitting inherent/system ones.
 * Supports 3- and 4-digit tile IDs.
 */
export function exportWormholePositions(editor) {
  const groups = {};
  for (const [id, hex] of Object.entries(editor.hexes)) {
  if (!/^\d{3,4}$/.test(id)) continue;

  // Make both sets lowercase for comparison!
  const inherent = new Set(Array.from(hex.inherentWormholes || []).map(w => w.toLowerCase()));
  const userWormholes = Array.from(hex.wormholes || [])
    .filter(w => !inherent.has(w.toLowerCase()));

  if (userWormholes.length === 0) continue;
  for (const wh of userWormholes) {
    if (!groups[wh]) groups[wh] = [];
    groups[wh].push(id);
  }
}

  const lines = Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([wh, ids]) =>
      `/add_token token:${wh} tile_name:${ids.sort((a, b) => +a - +b).join(',')}`
    );

  const output = lines.join('\n');
  const textarea = document.getElementById('exportWormholePositionsText');
  if (textarea) textarea.value = output;
  showModal('exportWormholePositionsModal');
}


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
 * Export the full editor state to JSON, including only user-added wormholes
 */
export function exportFullState(editor) {
  const hexes = Object.entries(editor.hexes).map(([label, hex]) => {
    const inherent      = hex.inherentWormholes || new Set();
    const userWormholes = Array.from(hex.wormholes || [])
      .filter(w => !inherent.has(w));

    return {
      // use the map key as your hex id
      id:       label,
      realId:   hex.realId != null ? hex.realId.toString() : '',
      q:        hex.q,
      r:        hex.r,
      planets:  Array.from(hex.planets || []),
      baseType: hex.baseType || '',
      effects:  Array.from(hex.effects || []),
      links:    hex.matrix,
      wormholes: userWormholes
    };
  });

  return JSON.stringify({ hexes }, null, 2);
}

/**
 * Builds the sector‐type string for export.
 * If hex.realId is defined, we use that ID directly.
 */

function parseLabel(id) {
  if (id === '000') return [0, 0];
  const len = id.length;
  const ring = +id.slice(0, len - 2);
  const idx  = +id.slice(len - 2);
  return [ring, idx];
}

export function exportSectorTypes(editor) {
  const getCode = (hex) => {
    if (!hex || hex.baseType === 'void') return '-1';
    if (hex.matrix) {
      const flat = hex.matrix.flat();
      const allZero = flat.every(v => v === 0);
      if (
        allZero &&
        hex.realId == null &&
        (!hex.baseType || hex.baseType === '')
      ) {
        return '-1';
      }
      if (flat.includes(1)) return 'HL';
    }
    if (hex.realId != null) return hex.realId.toString();
    if (hex.baseType) return typeCodeMap[hex.baseType] || 'HL';
    return '-1';
  };

  // Gather all labels except center, parse for sorting
  const parsedLabels = Object.keys(editor.hexes)
    .filter(id => /^\d{3,4}$/.test(id) && id !== '000')
    .map(id => ({ id, ring: parseLabel(id)[0], idx: parseLabel(id)[1] }));

  // Find the last significant hex (hyperlane, baseType, etc)
  let lastSignificant = -1;
  for (let i = 0; i < parsedLabels.length; i++) {
    const { id } = parsedLabels[i];
    const hex = editor.hexes[id];
    if (!hex) continue;
    const flat = hex.matrix?.flat?.() || [];
    const hasHL = flat.includes(1);
    const hasUseful = hasHL ||
      (hex.baseType && hex.baseType !== 'empty' && hex.baseType !== 'void');
    if (hasUseful) lastSignificant = i;
  }

  // Only keep up to lastSignificant
  const sortedLabels = parsedLabels
    .sort((a, b) => a.ring - b.ring || a.idx - b.idx)
    .slice(0, lastSignificant + 1);

  const rest = sortedLabels.map(({ id }) => getCode(editor.hexes[id]));

  const center = getCode(editor.hexes['000']);
  return `{${center}} ${rest.join(' ')}`;
}







/*
export function exportSectorTypes(editor) {
  const getCode = (hex) => {
    if (!hex) return 'HL';
    // 1) If this hex was tied to a real SystemInfo.json entry, export that ID:
    if (hex.realId != null) return hex.realId.toString();

    // 2) Otherwise fall back to “legacy” type tokens:
    const hasHL = hex.matrix?.flat().includes(1);
    if (!hex.baseType)                    return hasHL ? 'HL'  : 'HL';
    if (hex.baseType === 'empty')        return hasHL ? 'HL'  : typeCodeMap['empty'];
    return typeCodeMap[hex.baseType] || 'HL';
  };

  // Sort your 000 center plus the rest in row‐major order
  const entries = Object.entries(editor.hexes)
    .sort(([a], [b]) => {
      const rA = +a[0], iA = +a.slice(1);
      const rB = +b[0], iB = +b.slice(1);
      return rA !== rB ? rA - rB : iA - iB;
    });

  // Center tile in braces, rest space‐separated
  const center = getCode(editor.hexes['000']);
  const rest   = entries
    .filter(([id]) => id !== '000')
    .map(([, hex]) => getCode(hex));

  return `{${center}} ${rest.join(' ')}`;
}
*/