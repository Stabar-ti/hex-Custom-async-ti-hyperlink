// ───────────────────────────────────────────────────────────────
// draw/drawHexes.js
//
// This module manages SVG rendering of the main map grid and all hexes.
// It provides routines for generating hex layouts, drawing standard
// and special/corner hexes, and for auto-scaling the SVG view to fit
// all tiles. All geometric math and layout for the TI4 map lives here.
// ───────────────────────────────────────────────────────────────

import { ringDirections, sectorColors } from '../constants/constants.js';


/**
 * Draws the initial hex grid and attaches the grid to the SVG.
 * Used at startup and whenever the map is regenerated.
 * Removes previous content, creates new hexes, and sets up overlays.
 *
 * @param {HexEditor} editor
 */
export function drawHexGrid(editor) {
  const rings = 6; // Default number of rings (can be set by UI elsewhere)
  const layout = generateRings(rings);
  const svg = document.getElementById('hexMap');

  // Remove all previous SVG children
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  editor.hexes = {};

  // Draw each hex in the generated layout
  layout.forEach(({ q, r, label }) => {
    drawHex(editor, q, r, label);
  });

  // Remove lingering special corners (polygons, labels, and state)
  clearSpecialCorners(editor);

  // Now draw exactly one set of special corners
  drawSpecialHexes(editor);

  // Prepare a layer for wormhole link overlays
  const wormholeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  wormholeLayer.setAttribute('id', 'wormholeLineLayer');
  svg.appendChild(wormholeLayer);

  // Fit SVG view to the content
  autoscaleView(editor);
}


/**
 * Draws a single hex tile at the given (q, r) coordinates, with the given label.
 * Adds a clickable polygon and a label to the SVG, and tracks the hex in editor.hexes.
 */
export function drawHex(editor, q, r, label) {
  const svg = document.getElementById('hexMap');
  const center = hexToPixel(editor, q, r);

  // Calculate the six corner points of the hex
  const pts = Array.from({ length: 6 }, (_, i) => {
    const ang = Math.PI / 180 * 60 * i;
    return `${center.x + editor.hexRadius * Math.cos(ang)},${center.y + editor.hexRadius * Math.sin(ang)}`;
  });

  // SVG polygon for the hex outline
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('points', pts.join(' '));
  poly.setAttribute('fill', sectorColors['']);
  poly.setAttribute('data-label', label);
  poly.classList.add('hex');
  // Event listeners for click and hover (handled by editor)
  poly.addEventListener('click', e => editor._onHexClick?.(e, label));
  poly.addEventListener('mouseenter', () => editor.hoveredHexLabel = label);
  poly.addEventListener('mouseleave', () => editor.hoveredHexLabel = null);
  svg.appendChild(poly);

  // Add the hex label at the center
  const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  txt.setAttribute('x', center.x);
  txt.setAttribute('y', center.y + 5);
  txt.setAttribute('text-anchor', 'middle');
  txt.setAttribute('id', `label-${label}`);
  txt.textContent = label;
  svg.appendChild(txt);

  // Track the hex object in editor.hexes for later reference
  editor.hexes[label] = {
    q, r, center, polygon: poly, baseType: '',
    effects: new Set(), overlays: [],
    matrix: Array.from({ length: 6 }, () => Array(6).fill(0)),
    wormholes: new Set(), wormholeOverlays: []
  };
}

/**
 * Generate axial coordinates and labels for a hex ring layout.
 * Optionally excludes corners for "standard" TI4 map layouts.
 *
 * @param {number} n          - Number of rings (radius of map)
 * @param {boolean} fillCorners - If true, include corner hexes
 * @returns {Array}             - Array of {q, r, label}
 */
export function generateRings(n, fillCorners = false) {
  const layout = [{ q: 0, r: 0, label: '000' }];

  for (let ring = 1; ring <= n; ring++) {
    let q = 0, r = -ring, c = 1;
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < ring; step++) {
        const label = `${ring}${String(c).padStart(2, '0')}`;

        if (fillCorners) {
          const off = axialToOffset(q, r);
          if (off.col < -9 || off.col > 9 || off.row < -9 || off.row > 9) {
            q += ringDirections[side].q;
            r += ringDirections[side].r;
            c++;
            continue;
          }
        }

        layout.push({ q, r, label });
        c++;
        q += ringDirections[side].q;
        r += ringDirections[side].r;
      }
    }
  }

  return layout;
}

// Converts axial hex coordinates (q, r) to offset coordinates for layout filtering.
function axialToOffset(q, r) {
  return { col: q, row: r + Math.floor(q / 2) };
}

/**
 * Converts hex axial coordinates (q, r) to pixel (x, y) positions in SVG.
 * Centers the grid at (500, 500) and spaces based on editor.hexRadius.
 */
export function hexToPixel(editor, q, r) {
  return {
    x: editor.hexRadius * 1.5 * q + 500,
    y: editor.hexRadius * editor.sqrt3 * (r + q / 2) + 500
  };
}

/**
 * Draws four special "corner" hexes (TL, TR, BL, BR) outside the main grid.
 * Used for reference and for displaying off-map tiles.
 */
export function drawSpecialHexes(editor) {
  const pts = Object.values(editor.hexes).map(h => h.center);
  if (!pts.length) return;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const off = editor.hexRadius * 2;

  ['TL', 'TR', 'BL', 'BR'].forEach((lbl, i) => {
    const x = i % 2 === 0 ? minX - off : maxX + off;
    const y = i < 2 ? minY - off : maxY + off;
    drawCornerHex(editor, x, y, lbl);
  });
}

/**
 * Draws a single corner hex (e.g., "TL") at a specific (x, y) position.
 * Used only for reference/outside-grid hexes.
 */
export function drawCornerHex(editor, x, y, label) {
  const svg = document.getElementById('hexMap');
  const pts = Array.from({ length: 6 }, (_, i) => {
    const ang = Math.PI / 180 * 60 * i;
    return `${x + editor.hexRadius * Math.cos(ang)},${y + editor.hexRadius * Math.sin(ang)}`;
  });

  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('points', pts.join(' '));
  poly.setAttribute('fill', sectorColors['']);
  poly.setAttribute('data-label', label);
  poly.classList.add('hex');
  poly.addEventListener('click', e => editor._onHexClick?.(e, label));
  poly.addEventListener('mouseenter', () => editor.hoveredHexLabel = label);
  poly.addEventListener('mouseleave', () => editor.hoveredHexLabel = null);
  svg.appendChild(poly);

  // Draw label for the corner hex
  const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  txt.setAttribute('x', x);
  txt.setAttribute('y', y + 5);
  txt.setAttribute('text-anchor', 'middle');
  txt.setAttribute('id', `label-${label}`);
  txt.textContent = label;
  svg.appendChild(txt);

  // Track the corner hex in the editor, but mark as isCorner
  //const old = editor.hexes[label] || {};
  editor.hexes[label] = {
    q: null,
    r: null,
    center: { x, y },
    polygon: poly,
    baseType: '',
    effects: new Set(),
    overlays: [],
    matrix: Array.from({ length: 6 }, () => Array(6).fill(0)),
    wormholes: new Set(),
    wormholeOverlays: [],
    isCorner: true,
    planets: [],
    realId: null
  };
}

/**
 * Automatically adjusts the SVG's viewBox so the entire map fits in view,
 * including a margin around all drawn hexes.
 */
export function autoscaleView(editor) {
  const svg = document.getElementById('hexMap');
  const pts = Object.values(editor.hexes).map(h => h.center);
  if (!pts.length) return;

  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);

  const margin = editor.hexRadius * 1.5;

  const minX = Math.min(...xs) - margin;
  const maxX = Math.max(...xs) + margin;
  const minY = Math.min(...ys) - margin;
  const maxY = Math.max(...ys) + margin;

  svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
}

export function clearSpecialCorners(editor) {
  const svg = document.getElementById('hexMap');
  ['TL', 'TR', 'BL', 'BR'].forEach(label => {
    // Remove polygon
    const hex = editor.hexes[label];
    if (hex && hex.polygon && hex.polygon.parentNode) {
      hex.polygon.parentNode.removeChild(hex.polygon);
    }
    // Remove label
    const labelEl = document.getElementById(`label-${label}`);
    if (labelEl && labelEl.parentNode) {
      labelEl.parentNode.removeChild(labelEl);
    }
    // Remove from editor.hexes
    delete editor.hexes[label];
  });
}