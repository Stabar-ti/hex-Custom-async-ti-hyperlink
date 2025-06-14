// ui/uiEvents.js
import { assignSystem } from '../features/assignSystem.js';
import { wormholeTypes } from '../constants/constants.js';

export function registerClickHandler(editor) {
  editor._onHexClick = function (e, label) {
    // 1) if we just chose a system, assign it here
    if (this._pendingSystem) {
      assignSystem(this, this._pendingSystem, label);
      delete this._pendingSystem;
      return;
    }

    
    
    if (this.mode === 'hyperlane') {
      if (e.shiftKey) this.deleteAllSegments(label);
      else if (e.altKey) {
        this.unlinking = true;
        this._selectHex(label);
      } else {
        this._selectHex(label);
      }
      return;
    }

    if (["nebula", "rift", "asteroid", "supernova"].includes(this.mode)) {
      this.applyEffect(label, this.mode);
      return;
    }

 if (Object.keys(wormholeTypes).includes(this.mode)) {
  this.toggleWormholeOnHex(label, this.mode);
  return;
}

    this.setSectorType(label, this.mode);
  };
}
