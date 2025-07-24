// ───────────────────────────────────────────────────────────────
// features/effects.js
//
// This module manages visual overlays for "effects" on map hexes
// (nebula, rift, asteroid, supernova, etc.). Effects are shown as
// SVG emoji icons, placed in visually spaced positions around the
// hex. Includes functions to apply/clear effects, update overlay
// visibility, and create overlays for each effect.
// ───────────────────────────────────────────────────────────────


import { createEffectsOverlay } from '../features/baseOverlays.js'


/**
 * Applies an effect overlay (nebula, asteroid, etc.) to a hex.
 * Saves editor state for undo, adds the effect to the set, removes
 * existing overlays, and redraws overlays for all effects.
 *
 * @param {HexEditor} editor - The map editor instance
 * @param {string} hexId     - The hex label/id
 * @param {string} effect    - Effect name/key ("nebula", "rift", etc.)
 */
export function applyEffectToHex(editor, hexId, effect) {
  const hex = editor.hexes[hexId];
  if (!hex) return;

  editor.saveState(hexId); // For undo/redo

  hex.effects.add(effect); // Add the effect
  hex.overlays.forEach(o => editor.svg.removeChild(o)); // Remove old overlays
  hex.overlays = [];

  // Draw overlays for all effects in the set (so multiples can stack)
  Array.from(hex.effects).forEach((eff, i) => {
    const overlay = createEffectsOverlay(eff, hex.center, i, editor);
    editor.svg.appendChild(overlay);
    hex.overlays.push(overlay);
  });
}

/**
 * Removes all effects and their overlays from a hex.
 * (Note: does not save to history for undo by default!)
 *
 * @param {HexEditor} editor
 * @param {string} hexId
 */
export function clearAllEffects(editor, hexId, { skipSave = false } = {}) {
  const hex = editor.hexes[hexId];
  if (!hex) return;
  if (!skipSave) editor.saveState(hexId);
  hex.effects.clear();
  hex.overlays.forEach(o => editor.svg?.removeChild(o));
  hex.overlays = [];
}

/**
 * Recreates effects overlays for a specific hex.
 * This is useful when effects data has been moved/updated and the overlays need to be redrawn.
 *
 * @param {HexEditor} editor
 * @param {string} hexId
 */
export function refreshEffectsOverlays(editor, hexId) {
  const hex = editor.hexes[hexId];
  if (!hex) return;

  // Remove existing overlays
  hex.overlays.forEach(o => editor.svg?.removeChild(o));
  hex.overlays = [];

  // Recreate overlays for all effects in the set
  if (hex.effects && hex.effects.size > 0) {
    Array.from(hex.effects).forEach((eff, i) => {
      const overlay = createEffectsOverlay(eff, hex.center, i, editor);
      editor.svg.appendChild(overlay);
      hex.overlays.push(overlay);
    });
  }
}

/**
 * Refreshes effects overlays for all hexes that have effects.
 * This is useful after bulk operations like slice moves.
 *
 * @param {HexEditor} editor
 */
export function refreshAllEffectsOverlays(editor) {
  Object.entries(editor.hexes).forEach(([hexId, hex]) => {
    if (hex.effects && hex.effects.size > 0) {
      refreshEffectsOverlays(editor, hexId);
    }
  });
}

