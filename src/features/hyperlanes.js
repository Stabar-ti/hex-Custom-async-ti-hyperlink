// ─────────────── features/hyperlanes.js ───────────────
import { drawCurveLink, drawLoopCircle, drawLoopbackCurve, getDirIndex } from '../draw/links.js';

export function bindHyperlaneEditing(editor) {
  editor._selectHex = function (label) {
    if (!this.linking) return;
    const last = this.selectedPath[this.selectedPath.length - 1];
    if (!last || this.areNeighbors(last, label)) {
      this.selectedPath.push(label);
      this.hexes[label].polygon.classList.add('selected');
    }
    this._tryDrawLink();
  };

  editor._tryDrawLink = function () {
    const p = this.selectedPath;
    if (p.length < 3) return;
    const A = p[p.length - 3], B = p[p.length - 2], C = p[p.length - 1];
    const via = this.hexes[B];
    const entry = getDirIndex(via, this.hexes[A]);
    const exit = getDirIndex(via, this.hexes[C]);
    this.saveState(B);

    if (A === C && A !== B) {
      this._drawLoop(A, B);
      return;
    }
    if (this.unlinking) {
      this._unlink(A, B, C);
      return;
    }

    const seg = drawCurveLink(this.svg, via, entry, exit, B, this.hexRadius);
    this.drawnSegments.push(seg);
    via.matrix[entry][exit] = 1;
    this.selectedPath.slice(-2).forEach(id => this.hexes[id].polygon.classList.remove('selected'));
    this.selectedPath = this.selectedPath.slice(-2);
  };

  editor._drawLoop = function (A, B) {
    const via = this.hexes[B];
    const from = this.hexes[A];
    this.saveState(B);
    const entry = getDirIndex(via, from);
    if (entry < 0 || via.matrix[entry][entry]) return;
    const arc = drawLoopbackCurve(this.svg, via, entry, B);
    const circ = drawLoopCircle(this.svg, via.center.x, via.center.y, B);
    this.drawnSegments.push(arc, circ);
    via.matrix[entry][entry] = 1;
    this.selectedPath.slice(-3).forEach(id => this.hexes[id].polygon.classList.remove('selected'));
    this.selectedPath = [];
  };

  editor._unlink = function (A, B, C) {
    const via = this.hexes[B];
    this.saveState(B);
    const ent = getDirIndex(via, this.hexes[A]);
    const ext = getDirIndex(via, this.hexes[C]);
    if (via.matrix[ent][ext]) {
      via.matrix[ent][ext] = 0;
      const idx = this.drawnSegments.findIndex(seg => seg.dataset.via === B && +seg.dataset.entry === ent && +seg.dataset.exit === ext);
      if (idx >= 0) {
        this.svg.removeChild(this.drawnSegments[idx]);
        this.drawnSegments.splice(idx, 1);
      }
    }
    this.selectedPath.forEach(id => this.hexes[id].polygon.classList.remove('selected'));
    this.selectedPath = [];
    this.unlinking = false;
  };

  editor.deleteAllSegments = function (label) {
    this.drawnSegments = this.drawnSegments.filter(seg => {
      if (seg.dataset.via === label) {
        this.svg.removeChild(seg);
        return false;
      }
      return true;
    });
    const hex = this.hexes[label];
    if (!hex) return;
    hex.matrix.forEach((row, i) => row.forEach((_, j) => hex.matrix[i][j] = 0));
    hex.polygon.classList.remove('selected');
  };
}
/*
export function drawMatrixLinks(editor, label, matrix) {
  const hex = editor.hexes[label];
  if (!hex) return;

  for (let entry = 0; entry < 6; entry++) {
    for (let exit = 0; exit < 6; exit++) {
      if (matrix[entry][exit] === 1) {
        if (entry === exit) {
          drawLoopCircle(editor.svg, hex.center.x, hex.center.y, label);
          drawLoopbackCurve(editor.svg, hex, entry, label, 15);
        } else {
          drawCurveLink(editor.svg, hex, entry, exit, label, editor.hexRadius);
        }
      }
    }
  }
}
*/

export function drawMatrixLinks(editor, label, matrix) {
  const hex = editor.hexes[label];
  if (!hex) return;

  for (let entry = 0; entry < 6; entry++) {
    for (let exit = 0; exit < 6; exit++) {
      if (matrix[entry][exit] === 1) {
        if (entry === exit) {
          // Loop: store references to both shapes
          const circ = drawLoopCircle(editor.svg, hex.center.x, hex.center.y, label);
          const arc  = drawLoopbackCurve(editor.svg, hex, entry, label, 15);
          editor.drawnSegments.push(circ, arc);
        } else {
          const seg = drawCurveLink(editor.svg, hex, entry, exit, label, editor.hexRadius);
          editor.drawnSegments.push(seg);
        }
      }
    }
  }
}
