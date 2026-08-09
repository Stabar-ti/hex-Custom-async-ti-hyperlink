// ───────────────────────────────────────────────────────────────
// features/hyperlanes.js
//
// Compatibility shim. Hyperlane editing now lives in src/modules/Hyperlanes/:
//
//   hyperlaneModel.js     matrix algebra and the A→B→C click rule (pure, tested)
//   hyperlaneGeometry.js  edge midpoints, curve paths, loop arms (pure, tested)
//   hyperlaneState.js     the in-progress drawing gesture (store)
//   hyperlaneRender.js    layer management and per-hex redraw from the matrix
//   hyperlaneEditing.js   what a click means
//   hyperlaneUI.js        installHyperlanes(editor)
//   ../draw/hyperlaneDraw.js  SVG construction
//
// This file remains because `drawMatrixLinks` is imported from here by history.js,
// import.js, assignSystem.js and tileCopyPasteWizard.js — eleven call sites that have no
// reason to change. New code should call renderHex(editor, label) directly.
// ───────────────────────────────────────────────────────────────

import { renderHex } from '../modules/Hyperlanes/hyperlaneRender.js';

export { installHyperlanes as bindHyperlaneEditing } from '../modules/Hyperlanes/hyperlaneUI.js';

/**
 * Draws all hyperlane connections for a hex, given its matrix.
 * Used when restoring a saved map or importing hyperlane data.
 *
 * `matrix` is redundant — every call site in the tree passes `editor.hexes[label].matrix`,
 * which is what the renderer reads anyway. It is kept in the signature so those call sites
 * did not all have to change at once, and a matrix that genuinely is a different object is
 * copied in rather than dropped on the floor.
 *
 * @deprecated Call renderHex(editor, label) instead.
 * @param {HexEditor} editor
 * @param {string} label        - Hex label
 * @param {number[][]} [matrix] - 6x6 connection matrix; defaults to the hex's own
 */
export function drawMatrixLinks(editor, label, matrix) {
    const hex = editor?.hexes?.[label];
    if (!hex) return;
    if (matrix && matrix !== hex.matrix && Array.isArray(hex.matrix)) {
        for (let i = 0; i < 6; i++) {
            for (let j = 0; j < 6; j++) hex.matrix[i][j] = matrix[i]?.[j] === 1 ? 1 : 0;
        }
    }
    renderHex(editor, label);
}
