// ─────────────── features/effects.js ───────────────
import { effectIconPositions, effectEmojiMap, fallbackEffectEmoji } from '../constants/constants.js';

export function applyEffectToHex(editor, hexId, effect) {
  const hex = editor.hexes[hexId];
  if (!hex) return;

  editor.saveState(hexId);

  hex.effects.add(effect);
  hex.overlays.forEach(o => editor.svg.removeChild(o));
  hex.overlays = [];

  Array.from(hex.effects).forEach((eff, i) => {
    const overlay = createOverlay(eff, hex.center, i, editor);
    editor.svg.appendChild(overlay);
    hex.overlays.push(overlay);
  });
}

export function clearAllEffects(editor, hexId) {
  const hex = editor.hexes[hexId];
  if (!hex) return;
  //editor.saveState(hexId);
  hex.effects.clear();
  hex.overlays.forEach(o => editor.svg?.removeChild(o));
  hex.overlays = [];
}

export function updateEffectsVisibility(editor) {
  const show = editor.showEffects;
  Object.values(editor.hexes).forEach(hex => {
    if (!hex.overlays) return;
    hex.overlays.forEach(o => o.setAttribute('visibility', show ? 'visible' : 'hidden'));
  });
}

function createOverlay(type, center, index, editor) {
  const off = effectIconPositions[index % effectIconPositions.length];
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  icon.setAttribute('x', center.x + off.dx);
  icon.setAttribute('y', center.y + off.dy + 5);
  icon.setAttribute('text-anchor', 'middle');
  icon.classList.add('hex-overlay');
  icon.textContent = effectEmojiMap[type] ?? fallbackEffectEmoji;
  return icon;
}

