// ───────────────────────────────────────────────────────────────
// data/import.js
//
// This module manages all "import" logic for the TI4 map editor.
// It provides helpers to import map adjacency, sector types, and
// the full saved state (including overlays, wormholes, links, effects).
// Also loads system info (names, planet//s, IDs) for the sector lookup.
// ───────────────────────────────────────────────────────────────

import { hexToMatrix } from '../utils/matrix.js';
import { drawMatrixLinks } from '../features/hyperlanes.js';
import { toggleWormhole, updateHexWormholes } from '../features/wormholes.js';
//import { updateEffectsVisibility } from '../features/effects.js';
//import { drawCurveLink, drawLoopCircle, drawLoopbackCurve } from '../draw/links.js';
import { markRealIDUsed, unmarkRealIDUsed, beginBatch, endBatch, clearRealIDUsage, } from '../ui/uiFilters.js';
import { redrawAllRealIDOverlays } from '../features/realIDsOverlays.js';
import { MAX_MAP_RINGS } from '../constants/constants.js';
import { updateEffectsVisibility, updateWormholeVisibility } from '../features/baseOverlays.js'
import { generateRings } from '../draw/drawHexes.js';
import { isMatrixEmpty } from '../utils/matrix.js';
import { drawCustomAdjacencyLayer } from '../draw/customLinksDraw.js';
import { drawBorderAnomaliesLayer } from '../draw/borderAnomaliesDraw.js';
import { createWormholeOverlay } from '../features/baseOverlays.js';
import { updateTileImageLayer } from '../features/imageSystemsOverlay.js';

/**
 * Import map adjacency from a space-separated list of label,hexMatrix pairs.
 */
export function importMap(editor, dataText) {
  const entries = dataText.trim().split(/\s+/);
  entries.forEach(entry => {
    const [label, hexStr] = entry.split(',', 2).map(s => s.trim());
    if (!label || !hexStr || !/^[0-9a-fA-F]{1,9}$/.test(hexStr)) return;
    const hex = editor.hexes[label];
    if (!hex || !hex.center) return;
    editor.deleteAllSegments(label);
    hex.matrix = hexToMatrix(hexStr);
    drawMatrixLinks(editor, label, hex.matrix);
  });
}

/**
 * Loads SystemInfo.json (names, IDs, planet data, etc) and attaches to the editor.
 * Populates .sectorIDLookup for fast lookups by ID or alias.
 */
export async function loadSystemInfo(editor) {
  try {
    const res = await fetch(window.location.pathname.replace(/\/[^/]*$/, '/public/data/SystemInfo.json'))
    // if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // const res = await fetch('data/SystemInfo.json');
    //let res = await fetch('data/SystemInfo.json');
    //if (!res.ok) res = await fetch('public/data/SystemInfo.json');
    //if (!res.ok) res = await fetch('/data/SystemInfo.json');
    //if (!res.ok) res = await fetch('../public/data/SystemInfo.json');
    //if (!res.ok) res = await fetch('../data/SystemInfo.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const { systems } = await res.json();
    editor.sectorIDLookup = systems.reduce((acc, sys) => {
      const id = sys.id?.toString().toUpperCase();
      if (id) {
        acc[id] = sys;
        (sys.aliases || []).forEach(alias => {
          const code = alias.toString().toUpperCase();
          acc[code] = sys;
        });
      }
      editor.allSystems = systems;
      return acc;
    }, {});
    console.info(`Loaded ${Object.keys(editor.sectorIDLookup).length} systems.`);
  } catch (err) {
    console.error('Failed to load SystemInfo.json:', err);
    alert('Error loading system data.');
  }
}

export async function loadHyperlaneMatrices(editor) {
  let res = await fetch(window.location.pathname.replace(/\/[^/]*$/, '/public/data/hyperlanes.json'));
  if (!res.ok) res = await fetch('data/hyperlanes.json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const matrices = await res.json();
  editor.hyperlaneMatrices = matrices;
  // console.log('Loaded hyperlaneMatrices', Object.keys(matrices));
}

export function importSectorTypes(editor, tokenString) {
  // Remove braces, split tokens by whitespace
  const tokens = tokenString.trim().replace(/[{}]/g, '').split(/\s+/);

  // Find the minimum n where exported label count fits
  let n = 1;
  while (true) {
    let labelCount = 1; // '000'
    for (let r = 1; r <= n; r++) labelCount += 6 * r;
    if (labelCount >= tokens.length) break;
    n++;
    if (n > 30) throw new Error('Map too large to infer rings');
  }

  // Build padded label list as in exportSectorTypes
  let labelList = ['000'];
  for (let ring = 1; ring <= n; ring++) {
    for (let idx = 1; idx <= 6 * ring; idx++) {
      const label = `${ring}${String(idx).padStart(2, '0')}`;
      labelList.push(label);
    }
  }

  // Pad or trim tokens as needed
  if (tokens.length < labelList.length) {
    while (tokens.length < labelList.length) tokens.push('-1');
  } else if (tokens.length > labelList.length) {
    tokens.length = labelList.length;
  }

  // Set the ring count and rectangular mode (even for n <= 9, this is fine)
  const ringInput = document.getElementById('ringCount');
  if (ringInput) ringInput.value = n;
  editor.fillCorners = true;
  const cornerToggle = document.getElementById('cornerToggle');
  if (cornerToggle) cornerToggle.checked = true;
  editor.generateMap();

  // 6. Apply the types to each hex in order
  beginBatch?.();
  try {
    for (let idx = 0; idx < labelList.length; idx++) {
      const id = labelList[idx];
      const code = tokens[idx]?.toUpperCase() || '';
      const info = editor.sectorIDLookup?.[code] || {};
      const hex = editor.hexes[id];
      if (!hex) continue;

      // --- Handle hyperlane tiles (isHyperlane) ---
      if (info.isHyperlane) {
        // console.log('tester2')
        hex.realId = info.id ?? null;
        if (hex.realId) markRealIDUsed(hex.realId);
        hex.planets = [];
        // Draw hyperlane matrix if found in hyperlaneMatrices
        let matrixKey = (info.id || code || '').toLowerCase();
        if (editor.hyperlaneMatrices && matrixKey && editor.hyperlaneMatrices[matrixKey]) {
          editor.deleteAllSegments(id);
          //     console.log('tester3', matrixKey);
          const matrix = editor.hyperlaneMatrices[matrixKey];
          //console.log(matrix);
          hex.matrix = matrix.map(row => [...row]);
          hex.links = hex.matrix; // <-- This makes export/import and rendering consistent!
          drawMatrixLinks(editor, id, hex.matrix);
        } else {
          editor.deleteAllSegments(id);
          hex.matrix = Array.from({ length: 6 }, () => Array(6).fill(0));
          hex.links = hex.matrix;
        }
        // Clear wormholes, overlays, and skip everything else for this hex
        hex.wormholes = new Set();
        hex.wormholeOverlays?.forEach(o => editor.svg.removeChild(o));
        hex.wormholeOverlays = [];
        continue;
      }

      // --- The rest is unchanged, for normal tiles only ---
      hex.realId = info.id ?? null;
      if (hex.realId) markRealIDUsed(hex.realId);
      // Don't auto-assign planets from SystemInfo - only assign when explicitly imported
      hex.planets = [];

      // Clear existing wormholes
      hex.wormholes = new Set();
      hex.wormholeOverlays?.forEach(o => editor.svg.removeChild(o));
      hex.wormholeOverlays = [];

      // Inherent wormholes
      (info.wormholes || []).filter(Boolean).forEach(wh => {
        // console.log('importSectorTypes: inherent wormhole', id, wh);
        // Only set as inherent, do not toggle as custom
        if (!hex.inherentWormholes) hex.inherentWormholes = new Set();
        hex.inherentWormholes.add(wh.toLowerCase());
      });
      // Always update the union after setting inherent/custom wormholes
      if (typeof updateHexWormholes === 'function') updateHexWormholes(hex);
      // Remove all overlays and redraw for all wormholes (inherent + custom)
      hex.wormholeOverlays?.forEach(o => o.parentNode && o.parentNode.removeChild(o));
      hex.wormholeOverlays = [];
      Array.from(hex.wormholes).forEach((w, i) => {
        const positions = editor.effectIconPositions;
        const len = positions.length;
        const reversedIndex = len - 1 - (i % len);
        const pos = positions[reversedIndex] || { dx: 0, dy: 0 };
        const overlay = (typeof createWormholeOverlay === 'function')
          ? createWormholeOverlay(hex.center.x + pos.dx, hex.center.y + pos.dy, w.toLowerCase())
          : null;
        if (overlay) {
          const wormholeIconLayer = editor.svg.querySelector('#wormholeIconLayer');
          if (wormholeIconLayer) {
            wormholeIconLayer.appendChild(overlay);
          } else {
            editor.svg.appendChild(overlay);
          }
          hex.wormholeOverlays.push(overlay);
        }
      });
      // Debug: log after setting inherent
      // console.log('importSectorTypes: after inherent', id, {
      //   inherentWormholes: Array.from(hex.inherentWormholes || []),
      //   customWormholes: Array.from(hex.customWormholes || []),
      //   wormholes: Array.from(hex.wormholes || [])
      // });

      // Sector classification
      if (code === '-1') {
        editor.setSectorType(id, 'void');
        continue;
      }
      if (code === 'HL') continue;
      if ((info.planets || []).some(p => p.planetType === 'FACTION')) {
        editor.setSectorType(id, 'homesystem');
        continue;
      }
      const noPlanets = !(info.planets || []).length;
      const special = info.isAsteroidField || info.isSupernova || info.isNebula || info.isGravityRift;
      const hasWormholes = hex.wormholes && hex.wormholes.size > 0;
      const hasBorderAnomalies = hex.borderAnomalies && Object.keys(hex.borderAnomalies).length > 0;
      
      if (noPlanets && special) {
        editor.setSectorType(id, 'special');
      } else if ((info.planets || []).some(p => p.legendaryAbilityName?.trim())) {
        editor.setSectorType(id, 'legendary planet');
      } else {
        const count = (info.planets || []).length;
        if (count >= 3) editor.setSectorType(id, '3 planet');
        else if (count >= 2) editor.setSectorType(id, '2 planet');
        else if (count >= 1) editor.setSectorType(id, '1 planet');
        else if (hasWormholes || hasBorderAnomalies) editor.setSectorType(id, 'empty'); // Has content, so not void
        else editor.setSectorType(id, 'empty');
      }

      // Effects
      if (info.isNebula) editor.applyEffect(id, 'nebula');
      if (info.isGravityRift) editor.applyEffect(id, 'rift');
      if (info.isSupernova) editor.applyEffect(id, 'supernova');
      if (info.isAsteroidField) editor.applyEffect(id, 'asteroid');
    }


    // Redraw overlays
    redrawAllRealIDOverlays(editor);
    updateTileImageLayer(editor);
  } finally {
    endBatch?.();
  }
}

/**
 * Imports a full map state from a saved JSON export.
 * Re-creates all hexes, overlays, links, types, effects, and overlays.
 * Handles new grid/ring count, clears overlays, and redraws everything.
 */
export function importFullState(editor, jsonText) {
  beginBatch?.();
  try {
    const obj = JSON.parse(jsonText);
    // Support both old and new formats
    const hexArr = Array.isArray(obj.hexes) ? obj.hexes : (Array.isArray(obj) ? obj : []);
    if (!hexArr.length) throw new Error("Invalid data format");

    clearRealIDUsage();

    // ---- 1. Compute max ring from all numeric hex IDs (skip TL/TR/BL/BR)
    let maxRing = 1;
    for (const h of hexArr) {
      if (!/^\d{3,}$/.test(h.id)) continue;
      const m = String(h.id).match(/^(\d+)\d{2}$/);
      if (m) {
        const ringNum = parseInt(m[1], 10);
        if (ringNum > maxRing) maxRing = ringNum;
      }
    }

    // ---- 2. Build the label list (matches exportSectorTypes logic)
    let labelList = ['000'];
    for (let ring = 1; ring <= maxRing; ring++) {
      for (let idx = 1; idx <= 6 * ring; idx++) {
        const label = `${ring}${String(idx).padStart(2, '0')}`;
        labelList.push(label);
      }
    }

    // ---- 3. Build a lookup for hexes by id, then create a consistent list
    const hexMap = {};
    hexArr.forEach(h => { hexMap[h.id] = h; });
    const hexesOrdered = labelList.map(lab => hexMap[lab] || { id: lab });

    // ---- 4. Generate the correct grid
    document.getElementById('ringCount').value = maxRing;
    editor.fillCorners = true;
    const cornerToggle = document.getElementById('cornerToggle');
    if (cornerToggle) cornerToggle.checked = true;
    editor.generateMap();
    editor.drawnSegments = [];

    // ---- 5. Assign all hexes by label order (EXACT classification order)
    hexesOrdered.forEach((h, i) => {
      const id = labelList[i];
      let hex = editor.hexes[id];
      if (!hex) return;

      // Skip if really empty/no content
      const noContent =
        (!h.rid && !h.realId && !h.realID) &&
        (!h.bt && !h.baseType) &&
        (!h.pl && !h.planets) &&
        (!h.fx && !h.effects) &&
        (!h.wh && !h.wormholes) &&
        (!h.ln && !h.links) &&
        !h.ca && !h.customAdjacents && !h.ao && !h.adjacencyOverrides && !h.ba && !h.borderAnomalies;
      if (noContent) return;

      // Clean overlays/effects/wormholes
      hex.overlays?.forEach(o => { if (o.parentNode) o.parentNode.removeChild(o); });
      hex.overlays = [];
      hex.wormholeOverlays?.forEach(o => { if (o.parentNode) o.parentNode.removeChild(o); });
      hex.wormholeOverlays = [];
      hex.effects = new Set();

      // ---- System lookup: Get system info for inherent wormholes, etc
      let code = "-1";
      let info = {};
      let realId = h.rid ?? h.realId ?? h.realID;
      let realIdKey = realId ? realId.toString().toUpperCase() : null;
      if (realIdKey && editor.sectorIDLookup && editor.sectorIDLookup[realIdKey]) {
        code = realId.toString().toUpperCase();
        info = editor.sectorIDLookup[code] || {};
      } else if (h.bt || h.baseType) {
        code = h.bt || h.baseType;
        info = {};
      }

      // --------- Hyperlane tile logic ---------
      if (info.isHyperlane) {
        // Always mark as used and assign realId
        hex.realId = info.id ?? realId;
        if (hex.realId) markRealIDUsed(hex.realId);

        // Use matrix from map import (if present and non-empty), or from hyperlaneMatrices
        const links = h.ln || h.links;
        if (links && !isMatrixEmpty(links)) {
          hex.matrix = links;
          drawMatrixLinks(editor, id, hex.matrix);
        } else if (editor.hyperlaneMatrices && info.id && editor.hyperlaneMatrices[info.id.toLowerCase()]) {
          const matrix = editor.hyperlaneMatrices[info.id.toLowerCase()];
          hex.matrix = matrix.map(row => [...row]); // deep copy
          drawMatrixLinks(editor, id, hex.matrix);
        }
        // Do NOT assign baseType, overlays, planets, etc
        return;
      }
      // --------- End hyperlane tile logic ---------

      // Attach realId and planets (for normal tiles)
      hex.realId = info.id ?? realId ?? null;
      if (hex.realId) markRealIDUsed(hex.realId);
      
      // Only assign planets if they were explicitly stored in the import data
      // Don't auto-assign planets from SystemInfo just because realId matches
      hex.planets = h.pl || h.planets || [];

      // ---- Matrix/links (for non-hyperlane tiles)
      hex.matrix = h.ln || h.links || Array.from({ length: 6 }, () => Array(6).fill(0));
      drawMatrixLinks(editor, id, hex.matrix);

      // ---- Adjacency/custom links/border anomalies
      if (h.ca !== undefined) hex.customAdjacents = JSON.parse(JSON.stringify(h.ca));
      else if (h.customAdjacents !== undefined) hex.customAdjacents = JSON.parse(JSON.stringify(h.customAdjacents));
      else delete hex.customAdjacents;
      if (h.ao !== undefined) hex.adjacencyOverrides = JSON.parse(JSON.stringify(h.ao));
      else if (h.adjacencyOverrides !== undefined) hex.adjacencyOverrides = JSON.parse(JSON.stringify(h.adjacencyOverrides));
      else delete hex.adjacencyOverrides;
      if (h.ba !== undefined) hex.borderAnomalies = JSON.parse(JSON.stringify(h.ba));
      else if (h.borderAnomalies !== undefined) hex.borderAnomalies = JSON.parse(JSON.stringify(h.borderAnomalies));
      else delete hex.borderAnomalies;

      // ---- WORMHOLES: robust restoration
      hex.wormholeOverlays = [];
      // Set inherent and custom wormholes separately
      hex.inherentWormholes = new Set((info.wormholes || []).filter(Boolean).map(w => w.toLowerCase()));
      hex.customWormholes = new Set(Array.from(h.wh || h.wormholes || []).filter(Boolean).map(w => w.toLowerCase()));
      // Always update hex.wormholes as the union
      hex.wormholes = new Set([...hex.inherentWormholes, ...hex.customWormholes]);
      // Draw overlays for ALL wormholes (inherent + custom)
      hex.wormholeOverlays = [];
      Array.from(hex.wormholes).forEach((w, i) => {
        const positions = editor.effectIconPositions;
        const len = positions.length;
        const reversedIndex = len - 1 - (i % len);
        const pos = positions[reversedIndex] || { dx: 0, dy: 0 };
        const overlay = (typeof createWormholeOverlay === 'function')
          ? createWormholeOverlay(hex.center.x + pos.dx, hex.center.y + pos.dy, w.toLowerCase())
          : null;
        if (overlay) {
          const wormholeIconLayer = editor.svg.querySelector('#wormholeIconLayer');
          if (wormholeIconLayer) {
            wormholeIconLayer.appendChild(overlay);
          } else {
            editor.svg.appendChild(overlay);
          }
          hex.wormholeOverlays.push(overlay);
        }
      });

      // ---- Effects from JSON (always restore)
      (h.fx || h.effects || []).forEach(eff => eff && editor.applyEffect(id, eff));

      // ---- USE THE SAME CLASSIFICATION LOGIC AS importSectorTypes ---
      // Only set to void if explicitly marked as void in the import data
      if ((h.bt === "void" || h.baseType === "void") && isMatrixEmpty(h.ln || h.links)) {
        editor.setSectorType(id, 'void');
        return;
      }
      // Skip classification if no system info and no explicit baseType (keep existing state)
      if (code === '-1' && !h.bt && !h.baseType) return;
      
      if (code === 'HL' || !isMatrixEmpty(h.ln || h.links)) return;
      if ((info.planets || []).some(p => p.planetType === 'FACTION') || h.bt === "homesystem" || h.baseType === "homesystem") {
        editor.setSectorType(id, 'homesystem');
        return;
      }
      const noPlanets = !(info.planets || []).length;
      const special = info.isAsteroidField || info.isSupernova || info.isNebula || info.isGravityRift;
      const hasWormholes = hex.wormholes && hex.wormholes.size > 0;
      const hasBorderAnomalies = hex.borderAnomalies && Object.keys(hex.borderAnomalies).length > 0;
      
      if (noPlanets && special || h.bt === "special" || h.baseType === "special") {
        editor.setSectorType(id, 'special');
      } else if ((info.planets || []).some(p => p.legendaryAbilityName?.trim()) || h.bt === "legendary planet" || h.baseType === "legendary planet") {
        editor.setSectorType(id, 'legendary planet');
      } else {
        const count = (info.planets || []).length;
        if (count >= 3 || h.bt === "3 planet" || h.baseType === "3 planet") editor.setSectorType(id, '3 planet');
        else if (count >= 2 || h.bt === "2 planet" || h.baseType === "2 planet") editor.setSectorType(id, '2 planet');
        else if (count >= 1 || h.bt === "1 planet" || h.baseType === "1 planet") editor.setSectorType(id, '1 planet');
        else if (hasWormholes || hasBorderAnomalies) editor.setSectorType(id, 'empty'); // Has content, so not void
        else editor.setSectorType(id, 'empty');
      }

      // Effects from SystemInfo
      if (info.isNebula) editor.applyEffect(id, 'nebula');
      if (info.isGravityRift) editor.applyEffect(id, 'rift');
      if (info.isSupernova) editor.applyEffect(id, 'supernova');
      if (info.isAsteroidField) editor.applyEffect(id, 'asteroid');
    });

    // ---- 6. Restore any extra hexes (e.g. corners: tl, tr, bl, br) ----
    const extraHexes = hexArr.filter(h => !labelList.includes(h.id));
    extraHexes.forEach(h => {
      let hex = editor.hexes[h.id];
      if (!hex) return;
      // Clean overlays/effects/wormholes
      hex.overlays?.forEach(o => { if (o.parentNode) o.parentNode.removeChild(o); });
      hex.overlays = [];
      hex.wormholeOverlays?.forEach(o => { if (o.parentNode) o.parentNode.removeChild(o); });
      hex.wormholeOverlays = [];
      hex.effects = new Set();
      // Attach realId and planets
      let realId = h.rid ?? h.realId ?? h.realID;
      hex.realId = realId ?? null;
      if (hex.realId) markRealIDUsed(hex.realId);
      // Recover system info for inherent wormholes if realId is present
      let info = {};
      let realIdKey = realId ? realId.toString().toUpperCase() : null;
      if (realIdKey && editor.sectorIDLookup && editor.sectorIDLookup[realIdKey]) {
        info = editor.sectorIDLookup[realIdKey] || {};
      }
      hex.planets = h.pl || h.planets || [];
      // Restore baseType (color/classification)
      if (h.bt !== undefined) hex.baseType = h.bt;
      else if (h.baseType !== undefined) hex.baseType = h.baseType;
      else delete hex.baseType;
      if (hex.baseType) editor.setSectorType(h.id, hex.baseType);
      // Matrix/links
      hex.matrix = h.ln || h.links || Array.from({ length: 6 }, () => Array(6).fill(0));
      drawMatrixLinks(editor, h.id, hex.matrix);
      // Adjacency/custom links/border anomalies
      if (h.ca !== undefined) hex.customAdjacents = JSON.parse(JSON.stringify(h.ca));
      else if (h.customAdjacents !== undefined) hex.customAdjacents = JSON.parse(JSON.stringify(h.customAdjacents));
      else delete hex.customAdjacents;
      if (h.ao !== undefined) hex.adjacencyOverrides = JSON.parse(JSON.stringify(h.ao));
      else if (h.adjacencyOverrides !== undefined) hex.adjacencyOverrides = JSON.parse(JSON.stringify(h.adjacencyOverrides));
      else delete hex.adjacencyOverrides;
      if (h.ba !== undefined) hex.borderAnomalies = JSON.parse(JSON.stringify(h.ba));
      else if (h.borderAnomalies !== undefined) hex.borderAnomalies = JSON.parse(JSON.stringify(h.borderAnomalies));
      else delete hex.borderAnomalies;
      // Wormholes: recover inherent from system info, custom from save
      hex.inherentWormholes = new Set((info.wormholes || []).filter(Boolean).map(w => w.toLowerCase()));
      hex.customWormholes = new Set(Array.from(h.wh || h.wormholes || []).filter(Boolean).map(w => w.toLowerCase()));
      hex.wormholes = new Set([...hex.inherentWormholes, ...hex.customWormholes]);
      hex.wormholeOverlays = [];
      Array.from(hex.wormholes).forEach((w, i) => {
        const positions = editor.effectIconPositions;
        const len = positions.length;
        const reversedIndex = len - 1 - (i % len);
        const pos = positions[reversedIndex] || { dx: 0, dy: 0 };
        const overlay = (typeof createWormholeOverlay === 'function')
          ? createWormholeOverlay(hex.center.x + pos.dx, hex.center.y + pos.dy, w.toLowerCase())
          : null;
        if (overlay) {
          const wormholeIconLayer = editor.svg.querySelector('#wormholeIconLayer');
          if (wormholeIconLayer) {
            wormholeIconLayer.appendChild(overlay);
          } else {
            editor.svg.appendChild(overlay);
          }
          hex.wormholeOverlays.push(overlay);
        }
      });
      // Effects
      (h.fx || h.effects || []).forEach(eff => eff && editor.applyEffect(h.id, eff));
    });

    redrawAllRealIDOverlays(editor);
    drawCustomAdjacencyLayer(editor);
    drawBorderAnomaliesLayer(editor);
    updateEffectsVisibility(editor);
    updateWormholeVisibility(editor);
    updateTileImageLayer(editor);

  } catch (err) {
    console.error(err);
    alert('Import failed: ' + err.message);
  } finally {
    endBatch?.();
  }
}
