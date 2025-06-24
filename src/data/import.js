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
import { toggleWormhole } from '../features/wormholes.js';
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
   // const res = await fetch('data/SystemInfo.json');
    let res = await fetch('data/SystemInfo.json');
    if (!res.ok) res = await fetch('public/data/SystemInfo.json');
    if (!res.ok) res = await fetch('/data/SystemInfo.json');
    if (!res.ok) res = await fetch('../public/data/SystemInfo.json');
    if (!res.ok) res = await fetch('../data/SystemInfo.json');
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

      // Attach realId and planets
      hex.realId = info.id ?? null;
      if (hex.realId) markRealIDUsed(hex.realId);
      hex.planets = info.planets || [];

      // Restore customAdjacents, adjacencyOverrides, borderAnomalies if present
      //  if (h.customAdjacents !== undefined) hex.customAdjacents = JSON.parse(JSON.stringify(h.customAdjacents));
      //  else delete hex.customAdjacents;
      //  if (h.adjacencyOverrides !== undefined) hex.adjacencyOverrides = JSON.parse(JSON.stringify(h.adjacencyOverrides));
      //  else delete hex.adjacencyOverrides;
      //  if (h.borderAnomalies !== undefined) hex.borderAnomalies = JSON.parse(JSON.stringify(h.borderAnomalies));
      //  else delete hex.borderAnomalies;

      // Clear existing wormholes
      hex.wormholes = new Set();
      hex.wormholeOverlays?.forEach(o => editor.svg.removeChild(o));
      hex.wormholeOverlays = [];

      // Inherent wormholes
      (info.wormholes || []).filter(Boolean).forEach(wh => {
        toggleWormhole(editor, id, wh.toLowerCase());
      });

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
      if (noPlanets && special) {
        editor.setSectorType(id, 'special');
      } else if ((info.planets || []).some(p => p.legendaryAbilityName?.trim())) {
        editor.setSectorType(id, 'legendary planet');
      } else {
        const count = (info.planets || []).length;
        if (count >= 3) editor.setSectorType(id, '3 planet');
        else if (count >= 2) editor.setSectorType(id, '2 planet');
        else if (count >= 1) editor.setSectorType(id, '1 planet');
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
    if (!obj || !Array.isArray(obj.hexes)) throw new Error("Invalid data format");

    clearRealIDUsage();

    // ---- 1. Compute max ring from all numeric hex IDs (skip TL/TR/BL/BR)
    let maxRing = 1;
    for (const h of obj.hexes) {
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
    obj.hexes.forEach(h => { hexMap[h.id] = h; });
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
        (!h.realId && !h.realID) &&
        (!h.baseType || h.baseType === '') &&
        (!h.planets || h.planets.length === 0) &&
        (!h.effects || h.effects.length === 0) &&
        (!h.wormholes || h.wormholes.length === 0) &&
        (!h.links || isMatrixEmpty(h.links)) &&
        !h.customAdjacents && !h.adjacencyOverrides && !h.borderAnomalies;

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
      let realId = h.realId ?? h.realID;
      let realIdKey = realId ? realId.toString().toUpperCase() : null;
      if (realIdKey && editor.sectorIDLookup && editor.sectorIDLookup[realIdKey]) {
        code = realId.toString().toUpperCase();
        info = editor.sectorIDLookup[code] || {};
      } else if (h.baseType) {
        code = h.baseType;
        info = {};
      }

      // Attach realId and planets
      hex.realId = info.id ?? (h.realId ?? null);
      if (hex.realId) markRealIDUsed(hex.realId);
      hex.planets = info.planets || h.planets || [];

      // ---- Matrix/links
      hex.matrix = h.links || Array.from({ length: 6 }, () => Array(6).fill(0));
      drawMatrixLinks(editor, id, hex.matrix);

      // ---- Adjacency/custom links/border anomalies
      if (h.customAdjacents !== undefined) hex.customAdjacents = JSON.parse(JSON.stringify(h.customAdjacents));
      else delete hex.customAdjacents;
      if (h.adjacencyOverrides !== undefined) hex.adjacencyOverrides = JSON.parse(JSON.stringify(h.adjacencyOverrides));
      else delete hex.adjacencyOverrides;
      if (h.borderAnomalies !== undefined) hex.borderAnomalies = JSON.parse(JSON.stringify(h.borderAnomalies));
      else delete hex.borderAnomalies;

      // ---- WORMHOLES: robust restoration
      // ---- WORMHOLES: restore overlays for ALL wormholes (system + user)
      hex.wormholeOverlays = [];
      hex.wormholes = new Set();

      const inherentWormholes = (info.wormholes || []).filter(Boolean).map(w => w.toLowerCase());
      const userWormholes = (h.wormholes || []).filter(Boolean).map(w => w.toLowerCase());
      const allWormholes = new Set([...inherentWormholes, ...userWormholes]);

      for (const w of allWormholes) {
        toggleWormhole(editor, id, w);
      }

      // ---- Effects from JSON (always restore)
      (h.effects || []).forEach(eff => eff && editor.applyEffect(id, eff));

      // ---- USE THE SAME CLASSIFICATION LOGIC AS importSectorTypes ---
      if ((code === '-1' || h.baseType === "void") && isMatrixEmpty(h.links)) {
        editor.setSectorType(id, 'void');
        return;
      }
      if (code === 'HL' || !isMatrixEmpty(h.links)) return;
      if ((info.planets || []).some(p => p.planetType === 'FACTION') || h.baseType === "homesystem") {
        editor.setSectorType(id, 'homesystem');
        return;
      }
      const noPlanets = !(info.planets || []).length;
      const special = info.isAsteroidField || info.isSupernova || info.isNebula || info.isGravityRift;
      if (noPlanets && special || h.baseType === "special") {
        editor.setSectorType(id, 'special');
      } else if ((info.planets || []).some(p => p.legendaryAbilityName?.trim()) || h.baseType === "legendary planet") {
        editor.setSectorType(id, 'legendary planet');
      } else {
        const count = (info.planets || []).length;
        if (count >= 3 || h.baseType === "3 planet") editor.setSectorType(id, '3 planet');
        else if (count >= 2 || h.baseType === "2 planet") editor.setSectorType(id, '2 planet');
        else if (count >= 1 || h.baseType === "1 planet") editor.setSectorType(id, '1 planet');
        else editor.setSectorType(id, 'empty');
      }

      // Effects from SystemInfo
      if (info.isNebula) editor.applyEffect(id, 'nebula');
      if (info.isGravityRift) editor.applyEffect(id, 'rift');
      if (info.isSupernova) editor.applyEffect(id, 'supernova');
      if (info.isAsteroidField) editor.applyEffect(id, 'asteroid');
    });

    redrawAllRealIDOverlays(editor);
    drawCustomAdjacencyLayer(editor);
    drawBorderAnomaliesLayer(editor);
    updateEffectsVisibility(editor);
    updateWormholeVisibility(editor);

  } catch (err) {
    console.error(err);
    alert('Import failed: ' + err.message);
  } finally {
    endBatch?.();
  }
}
