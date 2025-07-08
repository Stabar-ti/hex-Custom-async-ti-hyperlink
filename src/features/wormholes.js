// ───────────────────────────────────────────────────────────────
// features/wormholes.js
//
// This module handles wormhole tokens for the map editor.
// It provides functions to toggle wormholes on hexes, render
// and update wormhole overlays, and ensure wormholes are visible
// or hidden based on user toggles. All SVG overlays for wormholes
// are managed here.
// ───────────────────────────────────────────────────────────────


import { createWormholeOverlay } from './baseOverlays.js';

/**
 * Toggle a wormhole token on a specific hex tile.
 * Adds or removes the wormhole, updates the hex state,
 * saves history, and re-renders wormhole overlays (SVG)
 * so they appear in reverse order for icon separation.
 *
 * @param {HexEditor} editor - The map editor instance.
 * @param {string} hexId     - The hex's unique label/id.
 * @param {string} type      - The wormhole type (e.g. 'alpha', 'beta').
 * @returns {Array<SVGElement>} - The current wormhole overlay elements for this hex.
 */
export function toggleWormhole(editor, hexId, type) {
  const hex = editor.hexes[hexId];
  if (!hex) return;

  // Ensure wormholes and overlays exist
  if (!hex.wormholes) hex.wormholes = new Set();
  if (!hex.wormholeOverlays) hex.wormholeOverlays = [];

  // Save editor state for undo/redo/history
  editor.saveState(hexId);

  // Add or remove wormhole type in set
  if (hex.wormholes.has(type)) {
    hex.wormholes.delete(type);
  } else {
    hex.wormholes.add(type);
  }

  // Remove all existing wormhole overlay SVGs from map
  hex.wormholeOverlays.forEach(o => editor.svg.removeChild(o));
  hex.wormholeOverlays = [];

  // Render each wormhole in reverse icon position order for better stacking
  Array.from(hex.wormholes).forEach((w, i) => {
    const positions = editor.effectIconPositions;
    const len = positions.length;
    // Distribute overlays around hex in reverse order
    const reversedIndex = len - 1 - (i % len);
    const pos = positions[reversedIndex] || { dx: 0, dy: 0 };

    // Create overlay group (circle+label) for the wormhole
    const overlay = createWormholeOverlay(
      hex.center.x + pos.dx,
      hex.center.y + pos.dy,
      w.toLowerCase()
    );

    const wormholeIconLayer = editor.svg.querySelector('#wormholeIconLayer');
    if (wormholeIconLayer) {
      wormholeIconLayer.appendChild(overlay);
    } else {
      editor.svg.appendChild(overlay);
    }
    hex.wormholeOverlays.push(overlay);
  });

  return hex.wormholeOverlays;
}

/**
 * Creates a single SVG overlay for a wormhole token.
 * Renders a colored circle with a text label (e.g. A, B, etc).
 *
 * @param {number} x    - X coordinate (center of hex + offset)
 * @param {number} y    - Y coordinate (center of hex + offset)
 * @param {string} type - Wormhole type key ('alpha', 'beta', ...)
 * @returns {SVGGElement} - SVG group containing circle and label
 */
/*
export function createWormholeOverlay(x, y, type) {
  const props = wormholeTypes[type] || {};
  const color = props.color || 'black';
  const label = props.label || '?';

  const svgns = 'http://www.w3.org/2000/svg';
  const group = document.createElementNS(svgns, 'g');

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
/*
export function updateWormholeVisibility(editor) {
  const visible = editor.showWormholes;
  Object.values(editor.hexes).forEach(hex => {
    hex.wormholeOverlays?.forEach(o => {
      o.setAttribute('visibility', visible ? 'visible' : 'hidden');
    });
  });
}
*/