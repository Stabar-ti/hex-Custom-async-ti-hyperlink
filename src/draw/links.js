// ─────────────── draw/links.js ───────────────
import { edgeDirections } from '../constants/constants.js';

export function areNeighbors(hexA, hexB) {
  const dq = hexB.q - hexA.q;
  const dr = hexB.r - hexA.r;
  return edgeDirections.some(d => d.q === dq && d.r === dr);
}

export function edgeMid(center, side, radius) {
  const a1 = Math.PI / 180 * (60 * side - 120);
  const a2 = Math.PI / 180 * (60 * (side + 1) - 120);
  const x1 = center.x + radius * Math.cos(a1);
  const y1 = center.y + radius * Math.sin(a1);
  const x2 = center.x + radius * Math.cos(a2);
  const y2 = center.y + radius * Math.sin(a2);
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

export function getDirIndex(from, to) {
  const dq = to.q - from.q;
  const dr = to.r - from.r;
  return edgeDirections.findIndex(d => d.q === dq && d.r === dr);
}

export function drawCurveLink(svg, hex, entry, exit, viaLabel, radius = 40) {
  const start = edgeMid(hex.center, entry, radius);
  const end = edgeMid(hex.center, exit, radius);
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


export function drawLoopbackCurve(svg, hex, entry, viaLabel, radius = 14) {
  const center = hex.center;
  const start = edgeMid(center, entry, hex.radius || 40); // outer edge of hex

  // Vector from start to center
  const dx = center.x - start.x;
  const dy = center.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  // Normalize and move inward by the loop radius
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
