import { sectorColors } from '../constants/constants.js';

export function setSectorType(editor, label, type) {
  const hex = editor.hexes[label];
  if (!hex) return;
  editor.saveState(label);
  hex.baseType = type;
  const fill = sectorColors[type] ?? sectorColors[''];
  hex.polygon?.setAttribute('fill', fill);
}