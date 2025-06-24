// ───────────────────────────────────────────────────────────────
// features/history.js
//
// Adds undo/redo history support to the map editor for robust 
// single and batch user actions. Works for sector, planet, overlay, 
// effect, wormhole, and hyperlane state, including all SVG overlays.
// ───────────────────────────────────────────────────────────────

import { clearAllEffects } from './effects.js';
import { applyEffectToHex } from './effects.js';
import { toggleWormhole } from './wormholes.js';
import { drawMatrixLinks } from './hyperlanes.js';
import { redrawAllRealIDOverlays } from './realIDsOverlays.js';
import { drawCustomAdjacencyLayer } from '../draw/customLinksDraw.js';
import { drawBorderAnomaliesLayer } from '../draw/borderAnomaliesDraw.js';

// ⬇️ Import filter management for realID tagging
import { markRealIDUsed, unmarkRealIDUsed, refreshSystemList } from '../ui/uiFilters.js';

let verbose = 0;
if (verbose) {
  console.log("History initialized");
}
/**
 * Attaches undo/redo history logic to the editor.
 * After calling this, the editor can group edits,
 * save snapshots, and perform robust undo/redo for all user actions.
 *
 * @param {HexEditor} editor - The active editor instance.
 */
export function initHistory(editor) {
  editor.undoStack = [];
  editor.redoStack = [];

  let currentGroup = null;
  let lastRestoredId = null;

  // ───── GROUPING FOR BATCH CHANGES ─────
  editor.beginUndoGroup = function () {
    if (verbose) {
      console.log("🧩 Begin undo group");
    }
    currentGroup = [];
  };

  editor.commitUndoGroup = function () {
    if (currentGroup && currentGroup.length) {
      // we already have full snapshots in currentGroup
      editor.undoStack.push({ type: 'group', hexes: currentGroup });
      if (editor.undoStack.length > 10) editor.undoStack.shift();
      editor.redoStack = [];

    }
    currentGroup = null;
  };

  // ───── SNAPSHOT (SAVE) STATE ─────
  editor.saveState = function (label) {
    // if flagged, skip any nested snapshots
    if (this._historyLocked) return;

    if (!this.hexes[label]) return;
    if (!currentGroup && label === lastRestoredId) return;


    const snapshot = this._cloneState(label);
    if (verbose) {
      console.log('saveState: snapshot', snapshot, 'called from', (new Error()).stack);
      console.log('Called with: ', snapshot)
    }

    if (currentGroup) {
      // push the full snapshot into the group
      if (!currentGroup.find(s => s.id === label)) {
        currentGroup.push(snapshot);
        if (verbose) {
          console.log("🗂 Added snapshot to group:", snapshot);
        }
      }
    } else {
      this.undoStack.push(snapshot);
      if (this.undoStack.length > 10) this.undoStack.shift();
      this.redoStack = [];
    }

    lastRestoredId = null;
  };

  // ───── UNDO ─────
  editor.undo = function () {
    const snap = this.undoStack.pop();
    if (!snap) return console.log("⚠️ Nothing to undo");

    if (snap.type === 'group') {
      const redoGroup = snap.hexes.map(s => this._cloneState(s.id));
      this.redoStack.push({ type: 'group', hexes: redoGroup });
      snap.hexes.forEach(s => this._restoreState(s));
    } else {
      const currentState = this._cloneState(snap.id);
      this.redoStack.push(currentState);
      this._restoreState(snap);
    }
    if (this.redoStack.length > 10) this.redoStack.shift();
    if (verbose) {
      console.log('Restoring state for', snap.id, this.hexes[snap.id]);
    }
    redrawAllRealIDOverlays(this);
    drawCustomAdjacencyLayer(this);
    drawBorderAnomaliesLayer(this);
    refreshSystemList(); // ⬅️ Ensure filter/search updates after undo
    // allow the next saveState() to go through
    lastRestoredId = null;
  };

  // ───── REDO ─────
  editor.redo = function () {
    const snap = this.redoStack.pop();
    if (!snap) return console.log("⚠️ Nothing to redo");

    if (snap.type === 'group') {
      const undoGroup = snap.hexes.map(s => this._cloneState(s.id));
      this.undoStack.push({ type: 'group', hexes: undoGroup });
      snap.hexes.forEach(s => this._restoreState(s));
    } else {
      const currentState = this._cloneState(snap.id);
      this.undoStack.push(currentState);
      this._restoreState(snap);
    }
    if (this.undoStack.length > 10) this.undoStack.shift();
    redrawAllRealIDOverlays(this);
    drawCustomAdjacencyLayer(this);
    drawBorderAnomaliesLayer(this);
    refreshSystemList(); // ⬅️ Ensure filter/search updates after redo
    lastRestoredId = null;
  };

  // ───── DEEP CLONE OF HEX STATE ─────
  editor._cloneState = function (label) {
    const hex = this.hexes[label];
    return {
      id: label,
      baseType: hex.baseType,
      realId: hex.realId ?? null,
      // only serialize if we truly have some planet data
      planets: (hex.planets === undefined)
        ? undefined
        : JSON.parse(JSON.stringify(hex.planets)),
      effects: new Set(hex.effects),
      wormholes: new Set(hex.wormholes),
      matrix: hex.matrix.map(r => [...r]),
      // ADD THESE:
      customAdjacents: hex.customAdjacents ? JSON.parse(JSON.stringify(hex.customAdjacents)) : undefined,
      adjacencyOverrides: hex.adjacencyOverrides ? JSON.parse(JSON.stringify(hex.adjacencyOverrides)) : undefined,
      borderAnomalies: hex.borderAnomalies ? JSON.parse(JSON.stringify(hex.borderAnomalies)) : undefined,
    };
  };

  // ───── RESTORE HEX STATE FROM SNAPSHOT (full overlay rebuild) ─────
  editor._restoreState = function (snap) {
    if (verbose) {
      console.log('restoreState: restoring snapshot', snap);
    }
    const hex = this.hexes[snap.id];
    if (!hex || !hex.center) return;
    lastRestoredId = snap.id;

    // 1. Remove all overlays/effects/wormholes/links
    this.deleteAllSegments(snap.id); // Hyperlanes
    clearAllEffects(this, snap.id);  // Nebula, rift, etc.

    // Remove wormhole overlays/icons
    hex.wormholeOverlays?.forEach(o => this.svg?.removeChild(o));
    hex.wormholeOverlays = [];
    hex.wormholes = new Set();

    // ⬇️ DETAG and RETAG realID in filter
    if (hex.realId && hex.realId !== snap.realId) {
      unmarkRealIDUsed(hex.realId);
    }
    if (snap.realId && snap.realId !== hex.realId) {
      markRealIDUsed(snap.realId);
    }

    // 2. Restore core state fields
    hex.baseType = snap.baseType;
    hex.realId = snap.realId ?? null;
    if (snap.planets === undefined) {
      delete hex.planets;
    } else {
      hex.planets = JSON.parse(JSON.stringify(snap.planets));
    }

    hex.effects = new Set(snap.effects);
    hex.wormholes = new Set(snap.wormholes);
    hex.matrix = snap.matrix.map(row => [...row]);

    // Restore custom links and anomalies state
    if (snap.customAdjacents === undefined) delete hex.customAdjacents;
    else hex.customAdjacents = JSON.parse(JSON.stringify(snap.customAdjacents));
    if (snap.adjacencyOverrides === undefined) delete hex.adjacencyOverrides;
    else hex.adjacencyOverrides = JSON.parse(JSON.stringify(snap.adjacencyOverrides));
    if (snap.borderAnomalies === undefined) delete hex.borderAnomalies;
    else hex.borderAnomalies = JSON.parse(JSON.stringify(snap.borderAnomalies));

    // 3. Re-draw sector, overlays, wormholes, links
    this.setSectorType(snap.id, hex.baseType);         // fill, possibly removes overlays
    hex.effects.forEach(eff => applyEffectToHex(this, snap.id, eff));
    hex.wormholes.forEach(w => toggleWormhole(this, snap.id, w));
    drawMatrixLinks(this, snap.id, hex.matrix);

    // 4. All overlays are rebuilt by redrawAllRealIDOverlays in undo/redo above
  };
}
