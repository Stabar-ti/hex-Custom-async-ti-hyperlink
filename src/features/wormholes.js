// ───────────────────────────────────────────────────────────────
// features/wormholes.js
//
// This module handles wormhole tokens for the map editor.
// It provides functions to toggle wormholes on hexes, render
// and update wormhole overlays, and ensure wormholes are visible
// or hidden based on user toggles. All SVG overlays for wormholes
// are managed here.
//
// Wormhole Handling Pattern (2024 Refactor):
//
// Each hex now has:
//   - inherentWormholes: wormholes from system/tile/realId (never exported/imported)
//   - customWormholes: user-placed wormholes (only these are exported/imported)
//   - wormholes: union of inherentWormholes and customWormholes (for overlays, UI, etc)
//
// All logic (import, export, overlays, undo, UI, distance calculations) must distinguish
// between inherent and custom wormholes. Only customWormholes are exported/imported.
//
// When mutating wormholes, always update customWormholes and call updateHexWormholes(hex)
// to refresh the union. This makes the codebase easier to maintain and debug.
// ───────────────────────────────────────────────────────────────


import { createWormholeOverlay } from './baseOverlays.js';

/**
 * Updates hex.wormholes to be the union of inherentWormholes and customWormholes.
 * Call this after any mutation to customWormholes or inherentWormholes.
 */
export function updateHexWormholes(hex) {
  hex.wormholes = new Set([
    ...(hex.inherentWormholes ? Array.from(hex.inherentWormholes) : []),
    ...(hex.customWormholes ? Array.from(hex.customWormholes) : [])
  ]);
  // Debug: log wormhole state after update
  // console.log('updateHexWormholes', {
  //   inherentWormholes: Array.from(hex.inherentWormholes || []),
  //   customWormholes: Array.from(hex.customWormholes || []),
  //   wormholes: Array.from(hex.wormholes || [])
  // });
}

/**
 * Toggle a wormhole token on a specific hex tile.
 * Only mutates customWormholes, then updates the union.
 *
 * @param {HexEditor} editor - The map editor instance.
 * @param {string} hexId     - The hex's unique label/id.
 * @param {string} type      - The wormhole type (e.g. 'alpha', 'beta').
 * @returns {Array<SVGElement>} - The current wormhole overlay elements for this hex.
 */
export function toggleWormhole(editor, hexId, type) {
  const hex = editor.hexes[hexId];
  if (!hex) return;
  // Ensure customWormholes and overlays exist
  if (!hex.customWormholes || !(hex.customWormholes instanceof Set)) {
    hex.customWormholes = new Set(hex.customWormholes ? Array.from(hex.customWormholes) : []);
  }
  if (!hex.wormholeOverlays) hex.wormholeOverlays = [];
  // Debug: log before mutation
  // console.log('toggleWormhole BEFORE', hexId, {
  //   customWormholes: Array.from(hex.customWormholes),
  //   type
  // });
  // Save editor state for undo/redo/history
  editor.saveState(hexId);
  // Add or remove wormhole type in customWormholes
  if (hex.customWormholes.has(type)) {
    hex.customWormholes.delete(type);
  } else {
    hex.customWormholes.add(type);
  }
  // Always update the union
  updateHexWormholes(hex);
  // Debug: log after mutation
  // console.log('toggleWormhole AFTER', hexId, {
  //   customWormholes: Array.from(hex.customWormholes),
  //   wormholes: Array.from(hex.wormholes)
  // });
  // Remove all existing wormhole overlay SVGs from map
  hex.wormholeOverlays.forEach(o => {
    if (o.parentNode) {
      o.parentNode.removeChild(o);
    }
  });
  hex.wormholeOverlays = [];

  // Render overlays for ALL wormholes (inherent + custom)
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
    // Always tag overlay group with hex label for easy removal (inherited and custom)
    overlay.setAttribute('data-label', hexId);

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
 * Overlays always reflect the union (hex.wormholes),
 * which is kept up to date by the new wormhole pattern.
 * All mutations must update customWormholes and call updateHexWormholes(hex).
 *
 * @param {HexEditor} editor - The map editor instance.
 */
export function updateWormholeVisibility(editor) {
  const visible = editor.showWormholes;
  Object.values(editor.hexes).forEach(hex => {
    hex.wormholeOverlays?.forEach(o => {
      o.setAttribute('visibility', visible ? 'visible' : 'hidden');
    });
  });
}