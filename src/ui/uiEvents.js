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
import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';

export function registerClickHandler(editor) {
  editor._onHexClick = function (e, label) {
    // 1. Lore selection mode: ignore and let custom handler deal with it
    if (this.mode === 'lore-selection') {
      return; // Let the lore selection handler process the click
    }

    // 3. Hyperlane editing: delete/link/unlink
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

    // 3. Effect overlays (nebula, rift, asteroid, supernova, scar)
    // applyEffect should save history
    if (["nebula", "rift", "asteroid", "supernova", "scar"].includes(this.mode)) {
      this.applyEffect(label, this.mode);
      return;
    }

    // 4. Wormhole toggle: helper should save history
    if (Object.keys(wormholeTypes).includes(this.mode)) {
      this.toggleWormholeOnHex(label, this.mode);
      return;
    }

    // 4b. Value target painting
    if (this.mode === 'value-target-apply' || this.mode === 'value-target-clear') {
      this.saveState(label);
      const hex = this.hexes[label];
      if (hex) {
        if (this.mode === 'value-target-clear') {
          hex.valueTarget = null;
        } else {
          // Stamp the current configuration from the Draw Helpers UI
          const cfg = this._valuePaintConfig;
          if (cfg) {
            hex.valueTarget = { tier: cfg.tier || null, r: !!cfg.r, i: !!cfg.i, t: !!cfg.t };
            // Normalise — if everything is falsy/null, treat as cleared
            const vt = hex.valueTarget;
            if (!vt.tier && !vt.r && !vt.i && !vt.t) hex.valueTarget = null;
          }
        }
        import('../features/valueOverlay.js').then(({ drawValueTargetLayer }) => {
          drawValueTargetLayer(this);
        }).catch(() => {});
      }
      return;
    }

    // 5. Sector type fill (for all other modes): snapshot BEFORE clearAll wipes the hex,
    // then lock history so setSectorType doesn't double-save.
    this.saveState(label);
    this._historyLocked = true;
    if (this.clearAll) this.clearAll(label);
    this._historyLocked = false;
    this.setSectorType(label, this.mode);

    enforceSvgLayerOrder(this.svg);
  };
}
