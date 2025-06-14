// data/import.js

import { hexToMatrix } from '../utils/matrix.js';
import { drawMatrixLinks } from '../features/hyperlanes.js';
import { toggleWormhole } from '../features/wormholes.js';
import { updateEffectsVisibility } from '../features/effects.js';
import { drawCurveLink, drawLoopCircle, drawLoopbackCurve } from '../draw/links.js';
import { updateWormholeVisibility } from '../features/wormholes.js';
import { markRealIDUsed, unmarkRealIDUsed, beginBatch, endBatch }      from '../ui/uiFilters.js';
import { redrawAllRealIDOverlays } from '../features/realIDsOverlays.js';

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
 * Fetches SystemInfo.json and populates editor.sectorIDLookup.
 */
export async function loadSystemInfo(editor) {
  try {
    const res = await fetch('public/data/SystemInfo.json');
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
      editor.allSystems = systems;    // <-- new
      return acc;
    }, {});
    

    console.info(`Loaded ${Object.keys(editor.sectorIDLookup).length} systems.`);
  } catch (err) {
    console.error('Failed to load SystemInfo.json:', err);
    alert('Error loading system data.');
  }
}
/*
/**
 * Imports sector codes (tokenString) to map tiles, applies types/effects.
 * Delegates wormhole rendering to toggleWormhole.
 */
export function importSectorTypes(editor, tokenString) {
  beginBatch();
  try {
  if (!editor.sectorIDLookup) {
    alert('Load SystemInfo JSON first.');
    return;
  }

  // Strip braces and split
  const tokens = tokenString.trim().replace(/[{}]/g, '').split(/\s+/);

  // Sort hex IDs
  const ids = Object.keys(editor.hexes)
    .filter(id => /^\d{3}$/.test(id))
    .sort((a, b) => {
      const [ra, ia] = [+a[0], +a.slice(1)];
      const [rb, ib] = [+b[0], +b.slice(1)];
      return ra === rb ? ia - ib : ra - rb;
    });

  if (tokens.length !== ids.length) console.warn(`Expected ${ids.length} codes but got ${tokens.length}`);

  ids.forEach((id, idx) => {
    const code = tokens[idx]?.toUpperCase() || '';
    const info = editor.sectorIDLookup[code] || {};
    const hex = editor.hexes[id];
    if (!hex) return;

    // Attach real ID
    hex.realId = info.id ?? null;
    if (hex.realId) markRealIDUsed(hex.realId);
    hex.planets = info.planets || [];
    //hex.wormholes = new Set(info.wormholes || []);

    // Clear existing wormholes
    hex.wormholes = new Set();
    hex.wormholeOverlays?.forEach(o => editor.svg.removeChild(o));
    hex.wormholeOverlays = [];

    // Inherent wormholes
    (info.wormholes || []).filter(Boolean).forEach(wh => {
      toggleWormhole(editor, id, wh.toLowerCase());
    });

    // DOM attribute
    if (info.id != null) {
      const el = document.getElementById(id);
      if (el) el.dataset.realId = info.id.toString();
    }

    // Classification
    if (code === '-1') return editor.setSectorType(id, 'void');
    if (code === 'HL') return;
    if ((info.planets || []).some(p => p.planetType === 'FACTION'))
      return editor.setSectorType(id, 'homesystem');
    const noPlanets = !(info.planets || []).length;
    const special = info.isAsteroidField || info.isSupernova || info.isNebula || info.isGravityRift;
    if (noPlanets && special) editor.setSectorType(id, 'special');
    else if ((info.planets || []).some(p => p.legendaryAbilityName?.trim() && p.legendaryAbilityText?.trim()))
      editor.setSectorType(id, 'legendary planet');
    else {
      const count = (info.planets || []).length;
      if (count >= 3) editor.setSectorType(id, '3 planet');
      else if (count >= 2) editor.setSectorType(id, '2 planet');
      else if (count >= 1) editor.setSectorType(id, '1 planet');
      else editor.setSectorType(id, 'empty');
    }

    // Effects
    if (info.isNebula || info.nebula)       editor.applyEffect(id, 'nebula');
    if (info.isGravityRift || info.gravity) editor.applyEffect(id, 'rift');
    if (info.isSupernova || info.nova)      editor.applyEffect(id, 'supernova');
    if (info.isAsteroidField || info.asteroid) editor.applyEffect(id, 'asteroid');

  });
  redrawAllRealIDOverlays(editor);
  }finally {
    // one single list‐refresh at the end
    endBatch();
  }
}

export function importFullState(editor, jsonText) {
  beginBatch?.();
  try {
    const obj = JSON.parse(jsonText);
    if (!obj || !Array.isArray(obj.hexes)) throw new Error("Invalid data format");

    // Set up rings and blank grid
    const maxRing = obj.hexes.reduce((max, h) => {
      const match = h.id?.match(/^(\d)/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 1);

    document.getElementById('ringCount').value = maxRing;
    editor.generateMap();
    editor.drawnSegments = [];

    obj.hexes.forEach(h => {
      editor.ensureHex(h.id, h.q, h.r);
      const hex = editor.hexes[h.id];
      if (!hex) return;

      // Remove all overlays/effects/wormholes from prior state
      hex.overlays?.forEach(o => { if (o.parentNode) o.parentNode.removeChild(o); });
      hex.overlays = [];
      hex.wormholeOverlays?.forEach(o => { if (o.parentNode) o.parentNode.removeChild(o); });
      hex.wormholeOverlays = [];
      hex.effects = new Set();
      hex.wormholes = new Set();

      // Restore matrix before drawing links
      hex.matrix = h.links || Array.from({ length: 6 }, () => Array(6).fill(0));
      drawMatrixLinks(editor, h.id, hex.matrix);

      // Restore realId if present, otherwise null
      hex.realId = (h.realId != null && h.realId !== '')
        ? h.realId.toString()
        : null;

      // Lookup sector info if possible
      let info = null;
      if (hex.realId && editor.sectorIDLookup) {
        info = editor.sectorIDLookup[hex.realId];
      }

      // --- Restore planets, classification, effects, wormholes, overlays ---
      if (info) {
        hex.planets = info.planets || [];
        hex.realId = info.id ?? null;
        if (hex.realId) markRealIDUsed?.(hex.realId);

        // Set sector type (classification logic)
        if ((info.planets || []).some(p => p.planetType === 'FACTION')) {
          editor.setSectorType(h.id, 'homesystem');
        } else if ((info.planets || []).some(
            p => p.legendaryAbilityName?.trim() && p.legendaryAbilityText?.trim())
        ) {
          editor.setSectorType(h.id, 'legendary planet');
        } else {
          const count = (info.planets || []).length;
          if (count >= 3) editor.setSectorType(h.id, '3 planet');
          else if (count >= 2) editor.setSectorType(h.id, '2 planet');
          else if (count >= 1) editor.setSectorType(h.id, '1 planet');
          else editor.setSectorType(h.id, 'empty');
        }

        // Effects (use info fields)
        if (info.isNebula || info.nebula)       editor.applyEffect(h.id, 'nebula');
        if (info.isGravityRift || info.gravity) editor.applyEffect(h.id, 'rift');
        if (info.isSupernova || info.nova)      editor.applyEffect(h.id, 'supernova');
        if (info.isAsteroidField || info.asteroid) editor.applyEffect(h.id, 'asteroid');
      } else {
        // fallback to what's in the saved JSON (if no lookup)
        hex.planets = h.planets || [];
        editor.setSectorType(h.id, h.baseType || '');
        (h.effects || []).forEach(eff => eff && editor.applyEffect(h.id, eff));
      }

      // --- Always restore wormholes from JSON (overrides info) ---
      (h.wormholes || []).filter(Boolean).forEach(wormhole =>
        toggleWormhole(editor, h.id, wormhole.toLowerCase?.() || wormhole)
      );

      // Fallback: restore planets, realId if not present already
      if (!hex.planets && h.planets) hex.planets = h.planets;
      if (!hex.realId && h.realId) hex.realId = h.realId;
    });

    // Redraw overlays for all hexes if needed
    //if (typeof redrawAllRealIDOverlays === 'function') {
      redrawAllRealIDOverlays(editor);
    //}

    // Update overlays visibility for toggles
    updateEffectsVisibility(editor);
    updateWormholeVisibility(editor);

  } catch (err) {
    console.error(err);
    alert('Import failed: ' + err.message);
  } finally {
    endBatch?.();
  }
}

/*
export function importFullState(editor, jsonText) {
  beginBatch();
  try {
    const { hexes: arr } = JSON.parse(jsonText);
    if (!Array.isArray(arr)) throw new Error('Invalid state');

    // figure out ringCount & regenerate blank grid
    const maxRing = arr.reduce((m, h) => {
      const ring = parseInt(h.id[0], 10);
      return isNaN(ring) ? m : Math.max(m, ring);
    }, 1);
    document.getElementById('ringCount').value = maxRing;
    editor.generateMap();
    editor.drawnSegments = [];


    arr.forEach(h => {
      
      // make sure this hex exists
      editor.ensureHex(h.id, h.q, h.r);
      const hex = editor.hexes[h.id];
      if (!hex) return;

      // --- 1) record the realID on the hex object
      hex.realId = (h.realId != null && h.realId !== '') 
                  ? h.realId.toString() 
                  : null;
      // also mark it used in your lookup UI
      if (hex.realId) {
      markRealIDUsed(hex.realId);
      hex.planets = info.planets || [];
      }  
      // --- 2) wipe out any old overlays/effects/wormholes
      hex.overlays?.forEach(o => editor.svg.removeChild(o));
      hex.overlays = [];
      hex.wormholeOverlays?.forEach(o => editor.svg.removeChild(o));
      hex.wormholeOverlays = [];

      // --- 3) restore basic fields
      hex.baseType   = h.baseType || '';
      hex.effects    = new Set(h.effects || []);
      hex.matrix     = h.links   || Array.from({ length: 6 }, () => Array(6).fill(0));
      hex.wormholes  = new Set(h.wormholes || []);

      // --- 4) redraw
      editor.setSectorType(h.id, hex.baseType);
      Array.from(hex.effects).forEach(e => editor.applyEffect(h.id, e));
      Array.from(hex.wormholes).forEach(w => toggleWormhole(editor, h.id, w));

      // --- 5) re‐draw hyperlane links from the matrix
      for (let entry = 0; entry < 6; entry++) {
        for (let exit = 0; exit < 6; exit++) {
          if (!hex.matrix[entry][exit]) continue;
          if (entry === exit) {
            // loopback
            const arc  = drawLoopbackCurve(editor.svg, hex, entry, h.id);
            const circ = drawLoopCircle(editor.svg, hex.center.x, hex.center.y, h.id);
            editor.drawnSegments.push(arc, circ);
          } else {
            // normal curve
            const seg = drawCurveLink(editor.svg, hex, entry, exit, h.id, editor.hexRadius);
            editor.drawnSegments.push(seg);
          }
        }
      }
    });

  redrawAllRealIDOverlays(editor);  
  } 
  catch (err) {
    console.error(err);
    alert('Import failed: ' + err.message);
  } finally {
    // one single list‐refresh at the end
    endBatch();
  }
}

*/
