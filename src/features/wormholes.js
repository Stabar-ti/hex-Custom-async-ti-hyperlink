// features/wormholes.js
import { wormholeTypes } from '../constants/constants.js';

/**
 * Toggles a wormhole token on a given hex (user-added or inherent).
 * Flips its presence, saves state, and re-renders overlays in reverse icon order.
 */
export function toggleWormhole(editor, hexId, type) {
  const hex = editor.hexes[hexId];
  if (!hex) return;

  // Initialize sets
  if (!hex.wormholes) hex.wormholes = new Set();
  if (!hex.wormholeOverlays) hex.wormholeOverlays = [];

  // Save history
  editor.saveState(hexId);

  // Toggle membership
  if (hex.wormholes.has(type)) {
    hex.wormholes.delete(type);
  } else {
    hex.wormholes.add(type);
  }

  // Clear existing overlays
  hex.wormholeOverlays.forEach(o => editor.svg.removeChild(o));
  hex.wormholeOverlays = [];

  // Render all wormholes (in reverse order)
  Array.from(hex.wormholes).forEach((w, i) => {
    const positions = editor.effectIconPositions;
    const len = positions.length;
    const reversedIndex = len - 1 - (i % len);
    const pos = positions[reversedIndex] || { dx: 0, dy: 0 };

    const overlay = createWormholeOverlay(
      hex.center.x + pos.dx,
      hex.center.y + pos.dy,
      w.toLowerCase()
    );

    editor.svg.appendChild(overlay);
    hex.wormholeOverlays.push(overlay);
  });

  return hex.wormholeOverlays;
}

/**
 * Constructs an SVG group overlay for a single wormhole token.
 * @param {number} x - center x-coordinate
 * @param {number} y - center y-coordinate
 * @param {string} type - wormhole type key
 */
export function createWormholeOverlay(x, y, type) {
  const props = wormholeTypes[type] || {};
  const color = props.color || 'black';
  const label = props.label || '?';

  const svgns = 'http://www.w3.org/2000/svg';
  const group = document.createElementNS(svgns, 'g');

  const circle = document.createElementNS(svgns, 'circle');
  circle.setAttribute('cx', x);
  circle.setAttribute('cy', y);
  circle.setAttribute('r', 10);
  circle.setAttribute('fill', color);
  circle.setAttribute('stroke', 'white');
  circle.setAttribute('stroke-width', 2);

  const text = document.createElementNS(svgns, 'text');
  text.setAttribute('x', x);
  text.setAttribute('y', y + 4);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('fill', 'white');
  text.setAttribute('font-size', '10');
  text.classList.add('hex-wormhole-label');
  text.textContent = label[0] || '?';

  group.appendChild(circle);
  group.appendChild(text);

  return group;
}

/**
 * Shows or hides all wormhole overlays based on editor.showWormholes flag.
 */
export function updateWormholeVisibility(editor) {
  const visible = editor.showWormholes;
  Object.values(editor.hexes).forEach(hex => {
    hex.wormholeOverlays?.forEach(o => {
      o.setAttribute('visibility', visible ? 'visible' : 'hidden');
    });
  });
}
