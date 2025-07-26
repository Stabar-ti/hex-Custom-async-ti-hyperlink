import { effectIconPositions, effectEmojiMap, fallbackEffectEmoji, wormholeTypes } from '../constants/constants.js';


/**
 * Creates a single SVG overlay for a wormhole token.
 * Renders a colored circle with a text label (e.g. A, B, etc).
 *
 * @param {number} x    - X coordinate (center of hex + offset)
 * @param {number} y    - Y coordinate (center of hex + offset)
 * @param {string} type - Wormhole type key ('alpha', 'beta', ...)
 * @returns {SVGGElement} - SVG group containing circle and label
 */
export function createWormholeOverlay(x, y, type) {
  const props = wormholeTypes[type] || {};
  const color = props.color || 'black';
  const label = props.label || '?';

  const svgns = 'http://www.w3.org/2000/svg';
  const group = document.createElementNS(svgns, 'g');

  // Set initial visibility to visible
  group.setAttribute('visibility', 'visible');

  // Draw the colored circle
  const circle = document.createElementNS(svgns, 'circle');
  circle.setAttribute('cx', x);
  circle.setAttribute('cy', y);
  circle.setAttribute('r', 10);
  circle.setAttribute('fill', color);
  circle.setAttribute('stroke', 'white');
  circle.setAttribute('stroke-width', 2);

  // Draw the wormhole label (A, B, etc.)
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
 * Shows or hides all wormhole overlays depending on
 * the value of editor.showWormholes.
 *
 * @param {HexEditor} editor - The map editor instance.
 */
export function updateWormholeVisibility(editor) {
  const visible = editor.showWormholes;

  // Ensure the wormholeIconLayer itself is visible/hidden
  const wormholeIconLayer = editor.svg.querySelector('#wormholeIconLayer');
  if (wormholeIconLayer) {
    wormholeIconLayer.setAttribute('visibility', visible ? 'visible' : 'hidden');
  }

  // Update individual overlay visibility
  Object.values(editor.hexes).forEach(hex => {
    if (hex.wormholeOverlays && hex.wormholeOverlays.length > 0) {
      hex.wormholeOverlays.forEach((o) => {
        o.setAttribute('visibility', visible ? 'visible' : 'hidden');
      });
    }
  });
}

/**
 * Shows or hides all effect overlays on the map depending on editor.showEffects.
 *
 * @param {HexEditor} editor
 */
export function updateEffectsVisibility(editor) {
  const show = editor.showEffects;
  Object.values(editor.hexes).forEach(hex => {
    if (!hex.overlays) return;
    hex.overlays.forEach(o => o.setAttribute('visibility', show ? 'visible' : 'hidden'));
  });
}

/**
 * Helper to create a single SVG text emoji overlay for an effect.
 * Places the emoji in a visually spaced position (using effectIconPositions).
 *
 * @param {string} type     - Effect type/key ("nebula", etc.)
 * @param {object} center   - {x, y} object (hex center coords)
 * @param {number} index    - Effect's index among overlays (for spacing)
 * @param {HexEditor} editor- The map editor (unused here but could be used)
 * @returns {SVGTextElement}
 */
export function createEffectsOverlay(type, center, index, editor) {
  // Pick a position for this overlay (e.g., above, right, left)
  const off = effectIconPositions[index % effectIconPositions.length];
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  icon.setAttribute('x', center.x + off.dx);
  icon.setAttribute('y', center.y + off.dy + 5); // +5 to visually center text
  icon.setAttribute('text-anchor', 'middle');
  icon.classList.add('hex-overlay');
  icon.textContent = effectEmojiMap[type] ?? fallbackEffectEmoji;
  return icon;
}

// ────────────── Distance Overlay Utilities ──────────────

/**
 * Render distance overlays (numbers) on each hex, except the origin.
 * @param {HexEditor} editor 
 * @param {object} result  Map of label → distance
 */
export function showDistanceOverlays(editor, result) {
  const svg = editor.svg || document.getElementById('hexMap');
  editor._distanceOverlays = editor._distanceOverlays || [];
  for (const [label, dist] of Object.entries(result)) {
    if (dist === 0) continue; // Don't overlay on the source hex
    const hex = editor.hexes[label];
    if (!hex || !hex.center) continue;

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', hex.center.x);
    text.setAttribute('y', hex.center.y - 15);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '24');
    text.setAttribute('fill', '#ffd700'); // dark yellow
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('stroke', '#222');
    text.setAttribute('stroke-width', '1');
    text.textContent = dist;
    text.classList.add('distance-overlay');

    svg.appendChild(text);
    editor._distanceOverlays.push(text);
  }
}

/**
 * Remove all distance overlays from the SVG map.
 * @param {HexEditor} editor 
 */
export function clearDistanceOverlays(editor) {
  const svg = editor.svg || document.getElementById('hexMap');
  const overlays = editor._distanceOverlays || [];
  overlays.forEach(el => {
    if (el.parentNode === svg) {
      svg.removeChild(el);
    }
  });
  editor._distanceOverlays = [];
}