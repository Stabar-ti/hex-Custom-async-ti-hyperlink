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
      // Check both planetType (string) and planetTypes (array) for FACTION
      if ((info.planets || []).some(p =>
        p.planetType === 'FACTION' ||
        (Array.isArray(p.planetTypes) && p.planetTypes.includes('FACTION'))
      )) {
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

      // ---- Import system lore
      if (h.sl) {
        hex.systemLore = {
          loreText: h.sl.lt || "",
          footerText: h.sl.ft || "",
          receiver: h.sl.r || "CURRENT",
          trigger: h.sl.t || "CONTROLLED",
          ping: h.sl.p || "NO",
          persistance: h.sl.pe || "ONCE"
        };
      } else {
        delete hex.systemLore;
      }

      // ---- Import planet lore
      if (h.prl && Object.keys(h.prl).length > 0) {
        hex.planetLore = {};
        Object.entries(h.prl).forEach(([planetIndex, lore]) => {
          if (lore) {
            hex.planetLore[planetIndex] = {
              loreText: lore.lt || "",
              footerText: lore.ft || "",
              receiver: lore.r || "CURRENT",
              trigger: lore.t || "CONTROLLED",
              ping: lore.p || "NO",
              persistance: lore.pe || "ONCE"
            };
          }
        });
      } else {
        delete hex.planetLore;
      }

      // ---- Import system tokens
      if (h.st && Array.isArray(h.st)) {
        hex.systemTokens = [...h.st];
      } else {
        hex.systemTokens = [];
      }

      // ---- Import planet tokens
      if (h.pt && Object.keys(h.pt).length > 0) {
        hex.planetTokens = {};
        Object.entries(h.pt).forEach(([planetIndex, tokens]) => {
          if (tokens && Array.isArray(tokens)) {
            hex.planetTokens[planetIndex] = [...tokens];
          }
        });
      } else {
        hex.planetTokens = {};
      }

      // ---- USE THE SAME CLASSIFICATION LOGIC AS importSectorTypes ---
      // Only set to void if explicitly marked as void in the import data
      if ((h.bt === "void" || h.baseType === "void") && isMatrixEmpty(h.ln || h.links)) {
        editor.setSectorType(id, 'void');
        return;
      }
      // Skip classification if no system info and no explicit baseType (keep existing state)
      if (code === '-1' && !h.bt && !h.baseType) return;

      if (code === 'HL' || !isMatrixEmpty(h.ln || h.links)) return;
      // Check both planetType (string) and planetTypes (array) for FACTION
      if ((info.planets || []).some(p =>
        p.planetType === 'FACTION' ||
        (Array.isArray(p.planetTypes) && p.planetTypes.includes('FACTION'))
      ) || h.bt === "homesystem" || h.baseType === "homesystem") {
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

      // ---- Import system lore (for extra hexes)
      if (h.sl) {
        hex.systemLore = {
          loreText: h.sl.lt || "",
          footerText: h.sl.ft || "",
          receiver: h.sl.r || "CURRENT",
          trigger: h.sl.t || "CONTROLLED",
          ping: h.sl.p || "NO",
          persistance: h.sl.pe || "ONCE"
        };
      } else {
        delete hex.systemLore;
      }

      // ---- Import planet lore (for extra hexes)
      if (h.prl && Object.keys(h.prl).length > 0) {
        hex.planetLore = {};
        Object.entries(h.prl).forEach(([planetIndex, lore]) => {
          if (lore) {
            hex.planetLore[planetIndex] = {
              loreText: lore.lt || "",
              footerText: lore.ft || "",
              receiver: lore.r || "CURRENT",
              trigger: lore.t || "CONTROLLED",
              ping: lore.p || "NO",
              persistance: lore.pe || "ONCE"
            };
          }
        });
      } else {
        delete hex.planetLore;
      }
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

/**
 * Cache for reverse wormhole token mappings (token ID -> wormhole type)
 */
let reverseWormholeTokenMapCache = null;

/**
 * Cache for token lookup by imagePath (e.g., "token_whalpha.png" -> token object)
 */
let tokenImagePathMapCache = null;

/**
 * Load reverse wormhole token mappings dynamically from tokens.json
 * Maps token IDs to wormhole type keys (e.g., 'whalpha' -> 'alpha')
 * @returns {Promise<Object>} Map of token ID to wormhole type
 */
async function getReverseWormholeTokenMap() {
  if (reverseWormholeTokenMapCache) return reverseWormholeTokenMapCache;

  try {
    const basePath = window.location.pathname.endsWith('/')
      ? window.location.pathname
      : window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);

    const response = await fetch(`${basePath}public/data/tokens.json`);
    if (!response.ok) throw new Error(`Failed to load tokens.json: ${response.status}`);

    const tokenGroups = await response.json();
    const allTokens = tokenGroups.flat();

    const map = {};

    // Build a reverse map of token ID to wormhole type
    allTokens.forEach(token => {
      if (token.wormholes && token.wormholes.length > 0) {
        token.wormholes.forEach(whType => {
          // Normalize wormhole type to lowercase
          const whKey = whType.toLowerCase()
            .replace('custom_eronous_wh', '')
            .replace('wh', '');

          // Map token ID to wormhole type
          map[token.id] = whKey;
        });
      }
    });

    console.log('Loaded reverse wormhole token map from tokens.json:', map);
    reverseWormholeTokenMapCache = map;
    return map;
  } catch (error) {
    console.error('Failed to load reverse wormhole token map, using fallback:', error);
    // Fallback to basic reverse mapping
    return {
      'whalpha': 'alpha',
      'whbeta': 'beta',
      'whgamma': 'gamma',
      'whdelta': 'delta',
      'whepsilon': 'epsilon',
      'wheta': 'eta',
      'custom_eronous_whiota': 'iota',
      'custom_eronous_whtheta': 'theta',
      'whzeta': 'zeta',
      'whkappa': 'kappa',
      'whchampion': 'champion',
      'whprobability': 'probability',
      'whvoyage': 'voyage',
      'whnarrows': 'narrows',
      'vortex': 'vortex'
    };
  }
}

/**
 * Load token lookup map by imagePath from tokens.json
 * Maps image filenames (e.g., "token_whalpha.png") to token objects
 * @returns {Promise<Object>} Map of imagePath to token object
 */
async function getTokenImagePathMap() {
  if (tokenImagePathMapCache) return tokenImagePathMapCache;

  try {
    const basePath = window.location.pathname.endsWith('/')
      ? window.location.pathname
      : window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);

    const response = await fetch(`${basePath}public/data/tokens.json`);
    if (!response.ok) throw new Error(`Failed to load tokens.json: ${response.status}`);

    const tokenGroups = await response.json();
    const allTokens = tokenGroups.flat();

    const map = {};

    // Build a map of imagePath to token object
    allTokens.forEach(token => {
      if (token.imagePath) {
        // Store the full token object for reference
        map[token.imagePath] = token;
        // Also store without path prefix if it has one
        const filename = token.imagePath.split('/').pop();
        if (filename !== token.imagePath) {
          map[filename] = token;
        }
      }
    });

    console.log('Loaded token imagePath map from tokens.json:', Object.keys(map).length, 'entries');
    tokenImagePathMapCache = map;
    return map;
  } catch (error) {
    console.error('Failed to load token imagePath map:', error);
    return {};
  }
}

let borderAnomalyAliasMapCache = null;

/**
 * Load border anomaly alias map from border.json
 * Maps alias names to their corresponding IDs
 * @returns {Promise<Object>} Map of alias (lowercase) to ID
 */
async function getBorderAnomalyAliasMap() {
  if (borderAnomalyAliasMapCache) return borderAnomalyAliasMapCache;

  try {
    const basePath = window.location.pathname.endsWith('/')
      ? window.location.pathname
      : window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);

    const response = await fetch(`${basePath}public/data/border.json`);
    if (!response.ok) throw new Error(`Failed to load border.json: ${response.status}`);

    const borderData = await response.json();
    const map = {};

    // Build a map of alias to ID
    borderData.forEach(border => {
      if (border.id) {
        // Map the ID itself (case-insensitive)
        map[border.id.toLowerCase()] = border.id;

        // Map all aliases to this ID
        if (Array.isArray(border.alias)) {
          border.alias.forEach(alias => {
            map[alias.toLowerCase()] = border.id;
          });
        }
      }
    });

    console.log('Loaded border anomaly alias map from border.json:', Object.keys(map).length, 'entries');
    borderAnomalyAliasMapCache = map;
    return map;
  } catch (error) {
    console.error('Failed to load border anomaly alias map:', error);
    return {};
  }
}

/**
 * Imports map data from the mapInfo JSON format (external program format).
 * This is the reverse of exportMapInfo - it takes a JSON object with a mapInfo array
 * and populates the editor with all tile data, planets, tokens, hyperlanes, border anomalies, etc.
 * 
 * @param {Object} editor - The hex editor instance
 * @param {string|Object} jsonData - Either a JSON string or parsed object with mapInfo array
 */
export async function importMapInfo(editor, jsonData) {
  beginBatch?.();
  try {
    // Parse JSON if it's a string
    const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    const mapInfo = data.mapInfo || [];

    if (!Array.isArray(mapInfo)) {
      throw new Error("Invalid mapInfo format - expected an array");
    }

    console.log(`importMapInfo: Importing ${mapInfo.length} hexes`);

    // Load reverse wormhole token map for converting token IDs back to wormhole types
    const reverseWhTokenMap = await getReverseWormholeTokenMap();

    // Load token imagePath map for fallback lookup when token IDs have file extensions
    const tokenImagePathMap = await getTokenImagePathMap();

    // Load border anomaly alias map for resolving anomaly names to IDs
    const borderAnomalyAliasMap = await getBorderAnomalyAliasMap();

    clearRealIDUsage();

    // Normalize corner tile positions to uppercase and collect them
    const cornerTilesInData = new Set();
    mapInfo.forEach(hexData => {
      const pos = hexData.position;
      // Check if it's a corner tile (non-numeric, like bl, tl, br, tr)
      if (/^(bl|br|tl|tr)$/i.test(pos)) {
        const normalized = pos.toUpperCase();
        hexData.position = normalized; // Normalize in place
        cornerTilesInData.add(normalized);
      }
    });

    // Determine maximum ring from positions
    let maxRing = 1;
    for (const hexData of mapInfo) {
      const position = hexData.position;
      if (!/^\d{3,}$/.test(position)) continue;
      const m = String(position).match(/^(\d+)\d{2}$/);
      if (m) {
        const ringNum = parseInt(m[1], 10);
        if (ringNum > maxRing) maxRing = ringNum;
      }
    }

    // Generate the map with the correct size
    document.getElementById('ringCount').value = maxRing;
    editor.fillCorners = true;
    const cornerToggle = document.getElementById('cornerToggle');
    if (cornerToggle) cornerToggle.checked = true;
    editor.generateMap();
    editor.drawnSegments = [];

    // Process each hex in the mapInfo
    for (const hexData of mapInfo) {
      const position = hexData.position;
      const hex = editor.hexes[position];

      if (!hex || !hex.center) {
        console.warn(`importMapInfo: Hex ${position} not found or not initialized`);
        continue;
      }

      // Determine if this is a corner tile (non-numeric position)
      const isCornerTile = !/^\d{3,4}$/.test(position);

      // Clean existing overlays/effects/wormholes
      hex.overlays?.forEach(o => { if (o.parentNode) o.parentNode.removeChild(o); });
      hex.overlays = [];
      hex.wormholeOverlays?.forEach(o => { if (o.parentNode) o.parentNode.removeChild(o); });
      hex.wormholeOverlays = [];
      hex.effects = new Set();

      // Set tileID as realId
      const tileID = hexData.tileID;
      if (tileID && tileID !== '' && tileID !== '-1') {
        hex.realId = tileID;
        markRealIDUsed(tileID);
      } else {
        hex.realId = null;
      }

      // Get system info from sectorIDLookup if available
      let info = {};
      const realIdKey = hex.realId ? hex.realId.toString().toUpperCase() : null;
      if (realIdKey && editor.sectorIDLookup && editor.sectorIDLookup[realIdKey]) {
        info = editor.sectorIDLookup[realIdKey] || {};
      }

      // Import planets
      if (hexData.planets && Array.isArray(hexData.planets) && hexData.planets.length > 0) {
        // Planets explicitly provided in JSON
        hex.planets = hexData.planets.map(planetData => {
          const planet = {
            id: planetData.planetID || '',
            planetID: planetData.planetID || '',
            attachments: planetData.attachments || []
          };
          return planet;
        });

        // Import planet lore
        hex.planetLore = {};
        hexData.planets.forEach((planetData, planetIndex) => {
          if (planetData.planetLore) {
            hex.planetLore[planetIndex] = {
              loreText: planetData.planetLore.loreText || "",
              footerText: planetData.planetLore.footerText || "",
              receiver: planetData.planetLore.receiver || "CURRENT",
              trigger: planetData.planetLore.trigger || "CONTROLLED",
              ping: planetData.planetLore.ping || "NO",
              persistance: planetData.planetLore.persistance || "ONCE"
            };
          }
        });
      } else if (info.planets && Array.isArray(info.planets) && info.planets.length > 0) {
        // No planets in JSON, extract from SystemInfo based on tileID
        // Copy the full planet object with all properties (resources, influence, planetType, etc.)
        hex.planets = info.planets.map(planetInfo => {
          // Create a deep copy of the planet object to preserve all data
          const planet = JSON.parse(JSON.stringify(planetInfo));
          // Ensure planetID is set
          if (!planet.planetID) planet.planetID = planet.id;
          // Add attachments if not present
          if (!planet.attachments) planet.attachments = [];
          return planet;
        });
        delete hex.planetLore;
      } else {
        hex.planets = [];
        delete hex.planetLore;
      }

      // Import tokens and extract custom wormholes
      hex.tokens = [];
      hex.customWormholes = new Set();

      if (hexData.tokens && Array.isArray(hexData.tokens)) {
        for (let tokenId of hexData.tokens) {
          // Fallback: If tokenId looks like a filename (has extension), try to resolve to actual token ID
          let actualTokenId = tokenId;
          let tokenData = null;

          // Check if it has a file extension (.png, .jpg, etc.)
          if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(tokenId)) {
            // Look up the token by imagePath
            tokenData = tokenImagePathMap[tokenId];
            if (tokenData) {
              actualTokenId = tokenData.id;
              console.log(`importMapInfo: Resolved token ${tokenId} to ID ${actualTokenId}`);
            } else {
              console.warn(`importMapInfo: Could not resolve token filename ${tokenId} to a token ID`);
            }
          }

          // Check if this token is a wormhole token using the resolved ID
          const whType = reverseWhTokenMap[actualTokenId];
          if (whType) {
            // This is a wormhole token, add to customWormholes
            hex.customWormholes.add(whType);
          } else {
            // Regular token, add to tokens array using the resolved ID
            hex.tokens.push(actualTokenId);
          }
        }
      }

      // Import custom hyperlane string and convert to matrix
      if (hexData.customHyperlaneString && hexData.customHyperlaneString !== '') {
        const rows = hexData.customHyperlaneString.split(';');
        hex.matrix = rows.map(row => row.split(',').map(v => parseInt(v, 10)));
        drawMatrixLinks(editor, position, hex.matrix);
      } else {
        hex.matrix = Array.from({ length: 6 }, () => Array(6).fill(0));
      }

      // Import border anomalies
      if (hexData.borderAnomalies && Array.isArray(hexData.borderAnomalies)) {
        hex.borderAnomalies = {};
        hexData.borderAnomalies.forEach(anomaly => {
          const direction = anomaly.direction;
          let type = anomaly.type;

          if (direction >= 0 && direction < 6 && type) {
            // Try to resolve the type using the alias map
            const resolvedType = borderAnomalyAliasMap[type.toLowerCase()] || type;

            if (resolvedType !== type) {
              console.log(`importMapInfo: Resolved border anomaly type "${type}" to ID "${resolvedType}"`);
            }

            hex.borderAnomalies[direction] = { type: resolvedType };
          }
        });
      } else {
        delete hex.borderAnomalies;
      }

      // Import system lore
      if (hexData.systemLore) {
        hex.systemLore = {
          loreText: hexData.systemLore.loreText || "",
          footerText: hexData.systemLore.footerText || "",
          receiver: hexData.systemLore.receiver || "CURRENT",
          trigger: hexData.systemLore.trigger || "CONTROLLED",
          ping: hexData.systemLore.ping || "NO",
          persistance: hexData.systemLore.persistance || "ONCE"
        };
      } else {
        delete hex.systemLore;
      }

      // Import Plastic field
      if (hexData.Plastic !== undefined && hexData.Plastic !== null) {
        hex.plastic = hexData.Plastic;
      } else {
        delete hex.plastic;
      }

      // Import custom adjacencies (simplified format - just array of target positions)
      if (hexData.customAdjacencies && Array.isArray(hexData.customAdjacencies)) {
        hex.customAdjacents = {};
        hexData.customAdjacencies.forEach(target => {
          // Assume two-way connections by default when importing from this format
          hex.customAdjacents[target] = { twoWay: true };
        });
      } else {
        delete hex.customAdjacents;
      }

      // Import adjacency overrides
      if (hexData.adjacencyOverrides && Array.isArray(hexData.adjacencyOverrides)) {
        hex.adjacencyOverrides = {};
        hexData.adjacencyOverrides.forEach(override => {
          const direction = override.direction;
          const secondary = override.secondary;
          if (direction >= 0 && direction < 6 && secondary) {
            hex.adjacencyOverrides[direction] = secondary;
          }
        });
      } else {
        delete hex.adjacencyOverrides;
      }

      // Set inherent wormholes from system info
      hex.inherentWormholes = new Set((info.wormholes || []).filter(Boolean).map(w => w.toLowerCase()));

      // Update hex.wormholes as union of inherent and custom
      if (typeof updateHexWormholes === 'function') {
        updateHexWormholes(hex);
      } else {
        hex.wormholes = new Set([...hex.inherentWormholes, ...hex.customWormholes]);
      }

      // Draw wormhole overlays for all wormholes
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

      // Determine and set sector type based on imported data
      const hasHyperlanes = hex.matrix && hex.matrix.flat().some(x => x === 1);

      if (hasHyperlanes) {
        // Hyperlane tile - don't set baseType, let it be handled by the system
        continue;
      } else if (tileID === '0g') {
        editor.setSectorType(position, 'homesystem');
      } else if (info.planets?.some(p => {
        // Check both planetType (string) and planetTypes (array) for FACTION
        return p.planetType === 'FACTION' ||
          (Array.isArray(p.planetTypes) && p.planetTypes.includes('FACTION'));
      })) {
        editor.setSectorType(position, 'homesystem');
      } else if (tileID === '-1') {
        editor.setSectorType(position, 'void');
      } else {
        // Classify based on planets and system info
        const planetCount = hex.planets?.length || 0;
        const hasLegendary = info.planets?.some(p => p.legendaryAbilityName?.trim());
        const special = info.isAsteroidField || info.isSupernova || info.isNebula || info.isGravityRift;
        const hasWormholes = hex.wormholes && hex.wormholes.size > 0;
        const hasBorderAnomalies = hex.borderAnomalies && Object.keys(hex.borderAnomalies).length > 0;

        if (planetCount === 0 && special) {
          editor.setSectorType(position, 'special');
        } else if (hasLegendary) {
          editor.setSectorType(position, 'legendary planet');
        } else if (planetCount >= 3) {
          editor.setSectorType(position, '3 planet');
        } else if (planetCount >= 2) {
          editor.setSectorType(position, '2 planet');
        } else if (planetCount >= 1) {
          editor.setSectorType(position, '1 planet');
        } else if (hasWormholes || hasBorderAnomalies) {
          editor.setSectorType(position, 'empty');
        } else {
          editor.setSectorType(position, 'empty');
        }

        // Apply effects from system info
        if (info.isNebula) editor.applyEffect(position, 'nebula');
        if (info.isGravityRift) editor.applyEffect(position, 'rift');
        if (info.isSupernova) editor.applyEffect(position, 'supernova');
        if (info.isAsteroidField) editor.applyEffect(position, 'asteroid');
      }
    }

    // Set all remaining hexes without data to void
    // Build label list for all hexes in the generated map
    let labelList = ['000'];
    for (let ring = 1; ring <= maxRing; ring++) {
      for (let idx = 1; idx <= 6 * ring; idx++) {
        const label = `${ring}${String(idx).padStart(2, '0')}`;
        labelList.push(label);
      }
    }

    // Add corner tiles if they exist in the editor
    const cornerTiles = ['TL', 'TR', 'BL', 'BR'];
    cornerTiles.forEach(corner => {
      if (editor.hexes[corner]) {
        labelList.push(corner);
      }
    });

    // Create a set of positions that were imported
    const importedPositions = new Set(mapInfo.map(hexData => hexData.position));

    // Set all non-imported positions to void
    for (const label of labelList) {
      if (!importedPositions.has(label)) {
        const hex = editor.hexes[label];
        if (hex && hex.center) {
          editor.setSectorType(label, 'void');
        }
      }
    }

    // Redraw all overlays and layers
    redrawAllRealIDOverlays(editor);
    drawCustomAdjacencyLayer(editor);
    drawBorderAnomaliesLayer(editor);
    updateEffectsVisibility(editor);
    updateWormholeVisibility(editor);
    updateTileImageLayer(editor);

    console.log('importMapInfo: Import completed successfully');

  } catch (err) {
    console.error('importMapInfo error:', err);
    alert('Import from mapInfo failed: ' + err.message);
  } finally {
    endBatch?.();
  }
}
