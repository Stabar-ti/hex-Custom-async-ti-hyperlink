// ───────────────────────────────────────────────────────────────
// features/history.js
//
// Undo/redo history for the map editor — per-affected-hex snapshots.
//
// Design rationale:
//   Each stack entry stores ONLY the hexes that changed, not the whole map.
//   This keeps memory proportional to the edit size:
//     - Single-tile edit  →  ~2 KB per step
//     - Paste of 50 tiles →  ~100 KB per step
//   A 15-ring map has ~721 hexes; full-map snapshots would cost ~1.4 MB each.
//   Per-hex snapshots make the 20-step limit viable even on large maps.
//
// Backward-compatible public API (no callers need to change):
//   editor.saveState(label)        — snapshot a single hex before mutating it
//   editor.beginUndoGroup()        — start a multi-hex batch
//   editor.commitUndoGroup()       — close the batch, push one undo entry
//   editor.rollbackUndoGroup()     — discard batch on error (call from catch blocks)
//   editor.undo() / editor.redo()  — restore previous/next state
//   editor._historyLocked          — set externally (import, automapper) to suppress saves
//
// Original file preserved at: src/features/history_original.js
// ───────────────────────────────────────────────────────────────

import { clearAllEffects, applyEffectToHex } from './effects.js';
import { toggleWormhole, updateHexWormholes } from './wormholes.js';
import { drawMatrixLinks } from './hyperlanes.js';
import { redrawAllRealIDOverlays } from './realIDsOverlays.js';
import { drawCustomAdjacencyLayer } from '../draw/customLinksDraw.js';
import { drawBorderAnomaliesLayer } from '../draw/borderAnomaliesDraw.js';
import { markRealIDUsed, unmarkRealIDUsed, refreshSystemList } from '../ui/uiFilters.js';

const HISTORY_LIMIT = 20;
const verbose = false;

/**
 * Attaches undo/redo history to the editor instance.
 * @param {HexEditor} editor
 */
export function initHistory(editor) {
    editor.undoStack = [];
    editor.redoStack = [];

    // Accumulates snapshots during a beginUndoGroup / commitUndoGroup bracket.
    // null when no group is open.
    let currentGroup = null;

    // ── SNAPSHOT ─────────────────────────────────────────────────────
    /**
     * Save a before-state snapshot of a single hex.
     * No-op when history is locked or a group already captured this hex.
     */
    editor.saveState = function (label) {
        if (this._historyLocked) return;
        if (!this.hexes[label]) return;

        const snapshot = this._cloneState(label);

        if (currentGroup !== null) {
            // Inside a group: only keep the first (pre-edit) snapshot per hex.
            if (!currentGroup.find(s => s.id === label)) {
                currentGroup.push(snapshot);
                if (verbose) console.log('[history] group snap:', label);
            }
        } else {
            this.undoStack.push(snapshot);
            if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
            this.redoStack = [];
            if (verbose) console.log('[history] snap:', label);
        }
    };

    // ── GROUP API ─────────────────────────────────────────────────────
    /**
     * Begin a multi-hex batch. All saveState calls until commitUndoGroup
     * accumulate into one undo entry.
     * Ignored if a group is already open (prevents double-nesting).
     */
    editor.beginUndoGroup = function () {
        if (this._historyLocked) return;
        if (currentGroup !== null) {
            if (verbose) console.warn('[history] beginUndoGroup called while group already open — ignored');
            return;
        }
        currentGroup = [];
        if (verbose) console.log('[history] beginUndoGroup');
    };

    /**
     * Close the current batch and push it as a single undo entry.
     * A group with no snapshots is silently discarded.
     */
    editor.commitUndoGroup = function () {
        if (currentGroup === null) return;

        if (currentGroup.length > 0) {
            this.undoStack.push({ type: 'group', hexes: currentGroup });
            if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
            this.redoStack = [];
            if (verbose) console.log('[history] commitUndoGroup, hexes:', currentGroup.length);
        }
        currentGroup = null;
    };

    /**
     * Discard the current batch without pushing to the stack.
     * Call from catch blocks to avoid leaking a half-built group on error.
     */
    editor.rollbackUndoGroup = function () {
        if (verbose && currentGroup !== null) console.log('[history] rollbackUndoGroup');
        currentGroup = null;
    };

    // ── UNDO ──────────────────────────────────────────────────────────
    editor.undo = function () {
        const snap = this.undoStack.pop();
        if (!snap) {
            if (verbose) console.log('[history] nothing to undo');
            return;
        }

        // Capture current state for redo BEFORE locking history.
        if (snap.type === 'group') {
            const redoGroup = snap.hexes.map(s => this._cloneState(s.id));
            this.redoStack.push({ type: 'group', hexes: redoGroup });
        } else {
            this.redoStack.push(this._cloneState(snap.id));
        }
        if (this.redoStack.length > HISTORY_LIMIT) this.redoStack.shift();

        // Lock history during restore so side-effects of setSectorType,
        // applyEffectToHex etc. cannot push spurious entries onto the stack.
        this._historyLocked = true;
        try {
            if (snap.type === 'group') {
                snap.hexes.forEach(s => this._restoreState(s));
            } else {
                this._restoreState(snap);
            }
        } finally {
            this._historyLocked = false;
        }

        _rebuildOverlays(this);
    };

    // ── REDO ──────────────────────────────────────────────────────────
    editor.redo = function () {
        const snap = this.redoStack.pop();
        if (!snap) {
            if (verbose) console.log('[history] nothing to redo');
            return;
        }

        if (snap.type === 'group') {
            const undoGroup = snap.hexes.map(s => this._cloneState(s.id));
            this.undoStack.push({ type: 'group', hexes: undoGroup });
        } else {
            this.undoStack.push(this._cloneState(snap.id));
        }
        if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();

        this._historyLocked = true;
        try {
            if (snap.type === 'group') {
                snap.hexes.forEach(s => this._restoreState(s));
            } else {
                this._restoreState(snap);
            }
        } finally {
            this._historyLocked = false;
        }

        _rebuildOverlays(this);
    };

    // ── DEEP CLONE OF A SINGLE HEX STATE ─────────────────────────────
    editor._cloneState = function (label) {
        const hex = this.hexes[label];
        return {
            id:                 label,
            baseType:           hex.baseType,
            realId:             hex.realId ?? null,
            planets:            hex.planets === undefined
                                  ? undefined
                                  : JSON.parse(JSON.stringify(hex.planets)),
            effects:            new Set(hex.effects),
            inherentWormholes:  new Set(hex.inherentWormholes),
            customWormholes:    new Set(hex.customWormholes),
            matrix:             hex.matrix ? hex.matrix.map(r => [...r]) : [],
            customAdjacents:    hex.customAdjacents
                                  ? JSON.parse(JSON.stringify(hex.customAdjacents))
                                  : undefined,
            adjacencyOverrides: hex.adjacencyOverrides
                                  ? JSON.parse(JSON.stringify(hex.adjacencyOverrides))
                                  : undefined,
            borderAnomalies:    hex.borderAnomalies
                                  ? JSON.parse(JSON.stringify(hex.borderAnomalies))
                                  : undefined,
            systemTokens:       hex.systemTokens ? [...hex.systemTokens] : [],
            planetTokens:       hex.planetTokens
                                  ? JSON.parse(JSON.stringify(hex.planetTokens))
                                  : {},
            systemLore:         hex.systemLore
                                  ? JSON.parse(JSON.stringify(hex.systemLore))
                                  : null,
            planetLore:         hex.planetLore
                                  ? JSON.parse(JSON.stringify(hex.planetLore))
                                  : null,
        };
    };

    // ── RESTORE A SINGLE HEX FROM SNAPSHOT ───────────────────────────
    editor._restoreState = function (snap) {
        const hex = this.hexes[snap.id];
        if (!hex || !hex.center) return;

        if (verbose) console.log('[history] restoring:', snap.id);

        // 1. Tear down existing visual state
        this.deleteAllSegments(snap.id);
        clearAllEffects(this, snap.id);
        hex.wormholeOverlays?.forEach(o => this.svg?.removeChild(o));
        hex.wormholeOverlays = [];

        // 2. Update realID filter tags before changing realId
        if (hex.realId && hex.realId !== snap.realId) unmarkRealIDUsed(hex.realId);
        if (snap.realId && snap.realId !== hex.realId) markRealIDUsed(snap.realId);

        // 3. Restore core data fields
        hex.baseType = snap.baseType;
        hex.realId   = snap.realId ?? null;

        if (snap.planets === undefined) delete hex.planets;
        else hex.planets = JSON.parse(JSON.stringify(snap.planets));

        hex.effects = new Set(snap.effects);
        hex.matrix  = snap.matrix.map(row => [...row]);

        if (snap.customAdjacents === undefined)    delete hex.customAdjacents;
        else hex.customAdjacents = JSON.parse(JSON.stringify(snap.customAdjacents));

        if (snap.adjacencyOverrides === undefined) delete hex.adjacencyOverrides;
        else hex.adjacencyOverrides = JSON.parse(JSON.stringify(snap.adjacencyOverrides));

        if (snap.borderAnomalies === undefined)    delete hex.borderAnomalies;
        else hex.borderAnomalies = JSON.parse(JSON.stringify(snap.borderAnomalies));

        // 4. Restore wormholes — rebuild the computed union via updateHexWormholes
        hex.inherentWormholes = new Set(snap.inherentWormholes || []);
        hex.customWormholes   = new Set(snap.customWormholes   || []);
        updateHexWormholes(hex);
        for (const w of hex.customWormholes) {
            toggleWormhole(this, snap.id, w);
        }

        // 5. Restore token state
        hex.systemTokens = snap.systemTokens ? [...snap.systemTokens] : [];
        hex.planetTokens = snap.planetTokens
            ? JSON.parse(JSON.stringify(snap.planetTokens))
            : {};

        // 6. Restore lore state
        hex.systemLore = snap.systemLore
            ? JSON.parse(JSON.stringify(snap.systemLore))
            : null;
        if (snap.planetLore) hex.planetLore = JSON.parse(JSON.stringify(snap.planetLore));
        else delete hex.planetLore;

        // 7. Rebuild visual representations
        // _historyLocked is true here so none of these trigger re-saves.
        this.setSectorType(snap.id, hex.baseType);
        hex.effects.forEach(eff => applyEffectToHex(this, snap.id, eff));
        drawMatrixLinks(this, snap.id, hex.matrix);
    };
}

// ── Rebuild all visual overlays after undo/redo ───────────────────
function _rebuildOverlays(editor) {
    redrawAllRealIDOverlays(editor);
    drawCustomAdjacencyLayer(editor);
    drawBorderAnomaliesLayer(editor);
    editor.tokenOverlay?.refresh();
    editor.loreOverlay?.refresh();
    refreshSystemList();
}
