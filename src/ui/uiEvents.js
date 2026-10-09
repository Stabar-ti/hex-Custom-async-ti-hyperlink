// ───────────────────────────────────────────────────────────────
// ui/uiEvents.js
//
// This module provides the main click handler for hex tiles
// in the SVG map. It interprets the current editing mode and
// the mouse event (including modifier keys), and performs the
// correct action: assigning systems, toggling effects, deleting
// or linking hyperlanes, wormhole toggles, or changing sector type.
// ───────────────────────────────────────────────────────────────

import { wormholeTypes } from '../constants/constants.js';
import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';
import { handleHexClick } from '../modules/Hyperlanes/hyperlaneEditing.js';
import { selectHex, isSelectMode } from '../features/hexSelection.js';
import { isGhostArmed } from '../features/pasteGhost.js';
import { activeClip, pasteAt } from '../features/tileClipboard.js';

export function registerClickHandler(editor) {
  editor._onHexClick = function (e, label) {
    // 1. Lore selection mode: ignore and let custom handler deal with it
    if (this.mode === 'lore-selection') {
      return; // Let the lore selection handler process the click
    }

    // 3. Hyperlane editing: delete/link/unlink.
    // The module owns its own history grouping and its own reading of the modifier keys.
    if (this.mode === 'hyperlane') {
      handleHexClick(this, label, e);
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
          // Stamp the current configuration from the Balance panel
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

    // 5. Nothing is armed, so the click is a read rather than an edit.
    //
    // Everything below this point paints, and it used to run for any mode the branches
    // above did not claim — including 'none', which is how every tool disarms, and '',
    // which is how the value-hint panel releases the map. Neither is a paint type, so
    // setSectorType looked them up in sectorColors, found nothing, and filled the hex with
    // the blank default. Clicking with no tool armed wiped tiles and pushed undo entries.
    //
    // isSelectMode guards on sectorColors rather than on a list of names, which is what
    // makes that safe: the paint modes ARE its keys, so a mode that is not one of them
    // cannot be painted by definition, whatever it is called.
    if (isSelectMode(this.mode)) {
      // With a ghost up, the click places it. The ghost stays armed afterwards: putting
      // the same block down in several places is the ordinary case, not an edge one.
      if (isGhostArmed() && activeClip()) {
        pasteAt(this, label, {
          confirmOverwrite: (labels) => window.confirm(
            `${labels.length} destination tile${labels.length === 1 ? ' is' : 's are'} not empty. Overwrite?`),
        });
        return;
      }
      selectHex(this, label, { additive: !!e?.shiftKey });
      return;
    }

    // 6. Sector type fill: snapshot BEFORE clearAll wipes the hex, then lock history so
    // setSectorType doesn't double-save.
    this.saveState(label);
    this._historyLocked = true;
    if (this.clearAll) this.clearAll(label);
    this._historyLocked = false;
    this.setSectorType(label, this.mode);

    enforceSvgLayerOrder(this.svg);
  };
}
