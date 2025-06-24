// ───────────────────────────────────────────────────────────────
// features/sectorTypes.js  (or similar)
//
// This module provides a helper for setting the "base" type of a
// hex on the map—such as planet, empty, nebula, etc. It sets the
// hex's type, records the change in undo history, and updates the
// SVG polygon's fill color accordingly.
// ───────────────────────────────────────────────────────────────

import { sectorColors } from '../constants/constants.js';

/**
 * Sets the sector (base) type of a hex, updates fill color,
 * and records the change in the editor's history stack.
 *
 * @param {HexEditor} editor - The map editor instance
 * @param {string} label     - The label/id of the hex
 * @param {string} type      - The new type to assign (must be a key in sectorColors)
 */
export function setSectorType(editor, label, type, { skipSave = false } = {}) {
  const hex = editor.hexes[label];
  if (!hex) return;

  if (!skipSave) editor.saveState(label);  // always record history

  hex.baseType = type;
  const fill = sectorColors[type] ?? sectorColors[''];
  hex.polygon?.setAttribute('fill', fill);
}
