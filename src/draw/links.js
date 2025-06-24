// ───────────────────────────────────────────────────────────────
// draw/links.js
//
// This module provides geometric utilities and SVG drawing routines
// for map hyperlane links, including normal curves, self-loop arcs,
// and connection logic. It helps render visual links between hexes
// in the TI4 map editor and supports both standard and advanced paths.
// ───────────────────────────────────────────────────────────────

import { edgeDirections } from '../constants/constants.js';

/**
 * Returns true if two hex objects are direct neighbors on the grid.
 *
 * @param {object} hexA - First hex ({q, r})
 * @param {object} hexB - Second hex ({q, r})
 * @returns {boolean}
 */
export function areNeighbors(hexA, hexB) {
  const dq = hexB.q - hexA.q;
  const dr = hexB.r - hexA.r;
  return edgeDirections.some(d => d.q === dq && d.r === dr);
}

/**
 * Calculates the midpoint of a hex edge, for drawing link start/end.
 *
 * @param {object} center - Center of the hex ({x, y})
 * @param {number} side   - Which edge (0..5)
 * @param {number} radius - Hex radius in px
 * @returns {object}      - {x, y} of edge midpoint
 */
export function edgeMid(center, side, radius) {
  // Calculate angles for two corners of the side
  const a1 = Math.PI / 180 * (60 * side - 120);
  const a2 = Math.PI / 180 * (60 * (side + 1) - 120);
  const x1 = center.x + radius * Math.cos(a1);
  const y1 = center.y + radius * Math.sin(a1);
  const x2 = center.x + radius * Math.cos(a2);
  const y2 = center.y + radius * Math.sin(a2);
  // Return their midpoint
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

/**
 * Returns the edge index (0..5) of 'to' relative to 'from', or -1 if not a neighbor.
 *
 * @param {object} from - Source hex ({q, r})
 * @param {object} to   - Neighbor hex ({q, r})
 * @returns {number}    - 0..5 if neighbor, -1 if not
 */
export function getDirIndex(from, to) {
  const dq = to.q - from.q;
  const dr = to.r - from.r;
  return edgeDirections.findIndex(d => d.q === dq && d.r === dr);
}

/**
 * Draws a curved hyperlane (quadratic SVG path) between two sides of a hex.
 *
 * @param {SVGElement} svg
 * @param {object} hex
 * @param {number} entry     - Which edge (0..5) to start from
 * @param {number} exit      - Which edge (0..5) to end at
 * @param {string} viaLabel  - Hex label for data-attribute
 * @param {number} radius    - Hex radius (default 40)
 * @returns {SVGPathElement}
 */
export function drawCurveLink(svg, hex, entry, exit, viaLabel, radius = 40) {
  const start = edgeMid(hex.center, entry, radius);
  const end = edgeMid(hex.center, exit, radius);
  // Compute control point for quadratic curve (pull towards hex center)
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const cx = hex.center.x + (mx - hex.center.x) * 0.25;
  const cy = hex.center.y + (my - hex.center.y) * 0.25;

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M${start.x},${start.y} Q${cx},${cy} ${end.x},${end.y}`);
  path.classList.add('link-line');
  path.dataset.via = viaLabel;
  path.dataset.entry = entry;
  path.dataset.exit = exit;

  svg.appendChild(path);
  return path;
}

/**
 * Draws a straight "loopback" (self-loop) curve from one side towards the center of the hex.
 *
 * @param {SVGElement} svg
 * @param {object} hex
 * @param {number} entry     - Which edge (0..5) is the loopback
 * @param {string} viaLabel  - Hex label for data-attribute
 * @param {number} radius    - Length of the loop arm (default 14)
 * @returns {SVGLineElement}
 */
export function drawLoopbackCurve(svg, hex, entry, viaLabel, radius = 14) {
  const center = hex.center;
  const start = edgeMid(center, entry, hex.radius || 40); // outer edge

  // Compute vector from edge toward center
  const dx = center.x - start.x;
  const dy = center.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  // Move inward by 'radius' along this vector
  const t = radius / len;
  const endX = center.x - dx * t;
  const endY = center.y - dy * t;

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  path.setAttribute('x1', start.x);
  path.setAttribute('y1', start.y);
  path.setAttribute('x2', endX);
  path.setAttribute('y2', endY);
  path.classList.add('link-line');
  path.dataset.via = viaLabel;
  path.dataset.entry = entry;
  path.dataset.exit = entry;

  svg.appendChild(path);
  return path;
}

/**
 * Draws a circular SVG path centered on (x, y) for self-loop overlays.
 *
 * @param {SVGElement} svg
 * @param {number} x
 * @param {number} y
 * @param {string} viaLabel - Hex label for data-attribute
 * @param {number} radius   - Circle radius (default 14)
 * @returns {SVGCircleElement}
 */
export function drawLoopCircle(svg, x, y, viaLabel, radius = 14) {
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', x);
  circle.setAttribute('cy', y);
  circle.setAttribute('r', radius);
  circle.setAttribute('stroke', 'blue');
  circle.setAttribute('stroke-width', 2);
  circle.setAttribute('fill', 'none');
  circle.classList.add('link-line');
  circle.dataset.via = viaLabel;

  svg.appendChild(circle);
  return circle;
}
