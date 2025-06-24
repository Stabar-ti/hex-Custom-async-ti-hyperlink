// ───────────────────────────────────────────────────────────────
// features/hyperlanes.js
//
// This module handles all logic for hyperlane drawing/editing in the map editor.
// It manages user interaction for selecting hexes to connect, drawing and
// removing SVG curve links, storing hyperlane segments in each hex's matrix,
// and removing all hyperlane links for a hex. It also supports "unlink" and
// "loopback" (self-loop) links for advanced editing.
// ───────────────────────────────────────────────────────────────

import { drawCurveLink, drawLoopCircle, drawLoopbackCurve, getDirIndex } from '../draw/links.js';

/**
 * Adds hyperlane editing methods to the editor instance, enabling path selection,
 * curve drawing, unlinking, self-loops, and segment deletion.
 * Should be called once from HexEditor constructor.
 *
 * @param {HexEditor} editor - The map editor instance.
 */
export function bindHyperlaneEditing(editor) {
  /**
   * Select a hex for hyperlane drawing. Only allows neighboring hexes
   * (unless it's the first click), then tries to draw a link.
   */
  editor._selectHex = function (label) {
    if (!this.linking) return;
    const last = this.selectedPath[this.selectedPath.length - 1];
    // Only allow path to grow to neighbors (unless it's the start of the path)
    if (!last || this.areNeighbors(last, label)) {
      this.selectedPath.push(label);
      this.hexes[label].polygon.classList.add('selected');
    }
    this._tryDrawLink();
  };

  /**
   * Attempts to draw a hyperlane segment (or loop) after each selection.
   * If three hexes are selected, draws a curve or self-loop as needed.
   * Handles unlinking if editor.unlinking is set.
   */
  editor._tryDrawLink = function () {
    const p = this.selectedPath;
    if (p.length < 3) return; // Need at least three hexes to draw a curve
    const A = p[p.length - 3], B = p[p.length - 2], C = p[p.length - 1];
    const via = this.hexes[B];
    const entry = getDirIndex(via, this.hexes[A]);
    const exit = getDirIndex(via, this.hexes[C]);
    this.saveState(B);

    if (A === C && A !== B) {
      // Handle loop: first and last are the same, middle is different
      this._drawLoop(A, B);
      return;
    }
    if (this.unlinking) {
      // Remove (unlink) this segment
      this._unlink(A, B, C);
      return;
    }

    // Draw SVG curve link for this segment and update matrix
    const seg = drawCurveLink(this.svg, via, entry, exit, B, this.hexRadius);
    this.drawnSegments.push(seg);
    via.matrix[entry][exit] = 1;

    // Remove "selected" highlight for just-drawn segment ends
    this.selectedPath.slice(-2).forEach(id => this.hexes[id].polygon.classList.remove('selected'));
    // Keep only the last two in the selected path
    this.selectedPath = this.selectedPath.slice(-2);
  };

  /**
   * Draws a self-loop overlay for the given middle hex (B), using the direction from (A).
   */
  editor._drawLoop = function (A, B) {
    const via = this.hexes[B];
    const from = this.hexes[A];
    this.saveState(B);
    const entry = getDirIndex(via, from);
    if (entry < 0 || via.matrix[entry][entry]) return; // Already exists or invalid
    // Draw both the loop arc and circular node
    const arc = drawLoopbackCurve(this.svg, via, entry, B);
    const circ = drawLoopCircle(this.svg, via.center.x, via.center.y, B);
    this.drawnSegments.push(arc, circ);
    via.matrix[entry][entry] = 1;
    // Remove all "selected" highlights for these three
    this.selectedPath.slice(-3).forEach(id => this.hexes[id].polygon.classList.remove('selected'));
    this.selectedPath = [];
  };

  /**
   * Removes a segment (entry→exit) from the given middle hex's matrix and SVG layer.
   * Called when in "unlinking" mode and user completes a segment selection.
   */
  editor._unlink = function (A, B, C) {
    const via = this.hexes[B];
    this.saveState(B);
    const ent = getDirIndex(via, this.hexes[A]);
    const ext = getDirIndex(via, this.hexes[C]);
    if (via.matrix[ent][ext]) {
      // Clear matrix and remove matching SVG curve
      via.matrix[ent][ext] = 0;
      const idx = this.drawnSegments.findIndex(seg => seg.dataset.via === B && +seg.dataset.entry === ent && +seg.dataset.exit === ext);
      if (idx >= 0) {
        this.svg.removeChild(this.drawnSegments[idx]);
        this.drawnSegments.splice(idx, 1);
      }
    }
    // Deselect all
    this.selectedPath.forEach(id => this.hexes[id].polygon.classList.remove('selected'));
    this.selectedPath = [];
    this.unlinking = false;
  };

  /**
   * Deletes all hyperlane segments associated with a specific hex (by label).
   * Removes segments from the SVG and resets the hex's matrix.
   */
  editor.deleteAllSegments = function (label) {
    this.saveState(label); // <--- Add this line!

    this.drawnSegments = this.drawnSegments.filter(seg => {
      if (seg.dataset.via === label) {
        this.svg.removeChild(seg);
        return false;
      }
      return true;
    });
    const hex = this.hexes[label];
    if (!hex) return;
    // Clear the segment connection matrix for this hex
    hex.matrix.forEach((row, i) => row.forEach((_, j) => hex.matrix[i][j] = 0));
    hex.polygon.classList.remove('selected');
  };
}

/**
 * Draws all hyperlane connections for a hex, given its matrix.
 * Used when restoring a saved map or importing hyperlane data.
 *
 * @param {HexEditor} editor
 * @param {string} label    - Hex label
 * @param {number[][]} matrix - 6x6 connection matrix
 */
export function drawMatrixLinks(editor, label, matrix) {
  const hex = editor.hexes[label];
  if (!hex) return;

  for (let entry = 0; entry < 6; entry++) {
    for (let exit = 0; exit < 6; exit++) {
      if (matrix[entry][exit] === 1) {
        if (entry === exit) {
          // Loopback: draw both circle and curve for self-loop
          const circ = drawLoopCircle(editor.svg, hex.center.x, hex.center.y, label);
          const arc = drawLoopbackCurve(editor.svg, hex, entry, label, 15);
          editor.drawnSegments.push(circ, arc);
        } else {
          // Normal segment: draw curve
          const seg = drawCurveLink(editor.svg, hex, entry, exit, label, editor.hexRadius);
          editor.drawnSegments.push(seg);
        }
      }
    }
  }
}
