console.log("History initialized");

export function initHistory(editor) {
  editor.undoStack = [];
  editor.redoStack = [];

  let currentGroup = null;
  let lastRestoredId = null; // ✅ prevent redundant re-saves after undo

  editor.beginUndoGroup = function () {
    console.log("🧩 Begin undo group");
    currentGroup = [];
  };

  editor.commitUndoGroup = function () {
    if (currentGroup && currentGroup.length) {
      const clonedGroup = currentGroup.map(({ id }) => editor._cloneState(id));
      editor.undoStack.push({ type: 'group', hexes: clonedGroup });
      if (editor.undoStack.length > 10) editor.undoStack.shift();
      editor.redoStack = [];
      console.log("✅ Group committed with", clonedGroup.length, "hexes. Undo stack:", editor.undoStack.length);
    }
    currentGroup = null;
  };

  editor.saveState = function (label) {
    if (!this.hexes[label]) return;

    if (!currentGroup && label === lastRestoredId) {
   //   console.log("🚫 Skipping save — matches last restored:", label);
      return;
    }

    const snapshot = this._cloneState(label);

    if (currentGroup) {
      if (!currentGroup.find(s => s.id === label)) {
        currentGroup.push({ id: label });
        console.log("🗂 Added to group:", label);
      }
    } else {
      this.undoStack.push(snapshot);
      if (this.undoStack.length > 10) this.undoStack.shift();
      this.redoStack = [];
     // console.log("💾 Single saved:", label, "Undo stack:", this.undoStack.length);
    }

    lastRestoredId = null; // ✅ reset after valid save
  };

  editor.undo = function () {
    const snap = this.undoStack.pop();
    if (!snap) return console.log("⚠️ Nothing to undo");

    if (snap.type === 'group') {
      const redoGroup = snap.hexes.map(s => this._cloneState(s.id));
      this.redoStack.push({ type: 'group', hexes: redoGroup });
      snap.hexes.forEach(s => this._restoreState(s));
     // console.log("↩️ Undid group of", snap.hexes.length, "Undo stack:", this.undoStack.length);
    } else {
      const currentState = this._cloneState(snap.id);
      this.redoStack.push(currentState);
      this._restoreState(snap);
    //  console.log("↩️ Undid single", snap.id, "Undo stack:", this.undoStack.length);
    }

    if (this.redoStack.length > 10) this.redoStack.shift();
  };

  editor.redo = function () {
    const snap = this.redoStack.pop();
    if (!snap) return console.log("⚠️ Nothing to redo");

    if (snap.type === 'group') {
      const undoGroup = snap.hexes.map(s => this._cloneState(s.id));
      this.undoStack.push({ type: 'group', hexes: undoGroup });
      snap.hexes.forEach(s => this._restoreState(s));
   //   console.log("↪️ Redid group of", snap.hexes.length, "Redo stack:", this.redoStack.length);
    } else {
      const currentState = this._cloneState(snap.id);
      this.undoStack.push(currentState);
      this._restoreState(snap);
    //  console.log("↪️ Redid single", snap.id, "Redo stack:", this.redoStack.length);
    }

    if (this.undoStack.length > 10) this.undoStack.shift();
  };

  editor._cloneState = function (label) {
    const hex = this.hexes[label];
    if (!hex) return null;

    return {
      id: label,
      baseType: hex.baseType,
      effects: new Set(hex.effects),
      wormholes: new Set(hex.wormholes),
      matrix: hex.matrix.map(row => [...row])
    };
  };

  editor._restoreState = function (snap) {
    const hex = this.hexes[snap.id];
    if (!hex || !hex.center) return;

    lastRestoredId = snap.id; // ✅ mark last restored to suppress duplicate saves

    // Clear visuals
    this.deleteAllSegments(snap.id);
    this.clearAllEffects(snap.id);
    hex.wormholeOverlays?.forEach(el => this.svg?.removeChild(el));
    hex.wormholeOverlays = [];
    hex.wormholes = new Set();

    // Restore data
    hex.baseType = snap.baseType;
    hex.effects = new Set(snap.effects);
    hex.wormholes = new Set(snap.wormholes);
    hex.matrix = snap.matrix.map(row => [...row]);

    // Apply visual updates
    this.setSectorType(snap.id, hex.baseType);
    hex.effects.forEach(eff => this.applyEffect(snap.id, eff));
    hex.wormholes.forEach(w => this.toggleWormholeOnHex(snap.id, w));

    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        if (hex.matrix[i][j] === 1) {
          if (i === j) {
            this.drawLoopCircle(snap.id);
            this.drawLoopbackCurve(snap.id, i);
          } else {
            this.drawCurveLink(snap.id, snap.id, i, j);
          }
        }
      }
    }

   // console.log(`🧹 Restored ${snap.id} with base: ${snap.baseType}, effects:`, [...snap.effects]);
  };
}
