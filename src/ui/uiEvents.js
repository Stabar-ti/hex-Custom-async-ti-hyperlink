// ───────────────────────────────────────────────────────────────
// ui/uiEvents.js
//
// This module provides the main click handler for hex tiles
// in the SVG map. It interprets the current editing mode and
// the mouse event (including modifier keys), and performs the
// correct action: assigning systems, toggling effects, deleting
// or linking hyperlanes, wormhole toggles, or changing sector type.
// ───────────────────────────────────────────────────────────────

import { assignSystem } from '../features/assignSystem.js';
import { wormholeTypes } from '../constants/constants.js';

export function registerClickHandler(editor) {
  editor._onHexClick = function (e, label) {
    // 1. System assign (always grouped for undo)
    if (this._pendingSystem) {
      this.beginUndoGroup();
      this.saveState(label);
      assignSystem(this, this._pendingSystem, label); // helper manages all mutations
      this.commitUndoGroup();
      delete this._pendingSystem;
      if (typeof window.redrawAllRealIDOverlays === "function") {
        window.redrawAllRealIDOverlays(this);
      }
      return;
    }

    // 2. Hyperlane editing: delete/link/unlink
    // deleteAllSegments, _selectHex, etc. MUST saveState internally
    if (this.mode === 'hyperlane') {
      if (e.shiftKey) {
        this.deleteAllSegments(label); // should save history itself
      } else if (e.altKey) {
        this.unlinking = true;
        this._selectHex(label);
      } else {
        this._selectHex(label);
      }
      return;
    }

    // 3. Effect overlays (nebula, rift, etc.)
    // applyEffect should save history
    if (["nebula", "rift", "asteroid", "supernova"].includes(this.mode)) {
      this.applyEffect(label, this.mode);
      return;
    }

    // 4. Wormhole toggle: helper should save history
    if (Object.keys(wormholeTypes).includes(this.mode)) {
      this.toggleWormholeOnHex(label, this.mode);
      return;
    }

    // 5. Sector type fill (for all other modes): setSectorType now always saves history unless told to skip
    if (this.clearAll) this.clearAll(label);
    this.setSectorType(label, this.mode);
  };
}
